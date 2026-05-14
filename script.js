// what locations to have in the map quiz
// E1 is my assigned location
// latitude/longitude get filled in by places api on page load
const locations = [
    { name: 'Where is Kurland Lecture Hall - E1?', query: 'Kurland Lecture Hall, California State University Northridge' },
    { name: 'Where is the BookStore - E2?', query: 'Campus Store Complex, California State University Northridge' },
    { name: 'Where is Bayramian Hall - C4?', query: 'Bayramian Hall, California State University Northridge' },
    { name: 'Where is Jacaranda Hall - E5?', query: 'Jacaranda Hall, California State University Northridge' },
    { name: 'Where is Manzanita Hall - D2?', query: 'Manzanita Hall, California State University Northridge' },
    { name: 'Where is Sierra Hall - C3?', query: 'Sierra Hall, California State University Northridge' },
    { name: 'Where is Eucalyptus Hall - E3?', query: 'Eucalyptus Hall, California State University Northridge' },
    { name: 'Where is Live Oak Hall - E3?', query: 'Live Oak Hall, California State University Northridge' },
    { name: 'Where is Maple Hall - C2?', query: 'Maple Hall, California State University Northridge' },
    { name: 'Where is Bookstein Hall - C5?', query: 'Bookstein Hall, California State University Northridge' }
];

const SCORE_KEY = 'mapQuizHighScore'; // localStorage key

let questionIndex = 0;
let correctCount = 0;
let map;
let startTime;
let timerId;

// on content load, set up map and then start the quiz
async function init() {
    // kurland stays question 1 no matter what bc this is my assigned location
    // otherwise, we shuffle the rest and take 4
    const [first, ...rest] = locations;
    rest.sort(() => Math.random() - 0.5);
    locations.length = 0;
    locations.push(first, ...rest.slice(0, 4));

    displayBest();

    // look up csun via geocoder so we can centralize places searches to this general area
    const geocoder = new google.maps.Geocoder();
    const csunResults = await geocoder.geocode({ address: 'California State University Northridge' });
    const csunViewport = csunResults.results[0].geometry.viewport;

    // places service gives tighter viewports for individual buildings (geocoder ones were way too large!)
    const places = new google.maps.places.PlacesService(document.createElement('div'));

    // look up each building and build box centered on its actual location
    // i.e. we use places' location field as primary coordinates
    // and we use places' viewport field as the general size of the box
    await Promise.all(locations.map(building => new Promise(resolve => {
        places.findPlaceFromQuery({
            query: building.query, fields: ['geometry'], locationBias: csunViewport
        }, ([place]) => {
            building.position = place.geometry.location;
            building.bounds = boxAround(place.geometry.location, place.geometry.viewport, 1 / 3);
            resolve();
        });
    })));

    // center the map on the middle of the 5 buildings so we can see them all
    // (when I was using just CSUN's coordinates as the center, my assigned location Kurland Lecture Hall was getting cropped out)
    const middle = new google.maps.LatLngBounds();
    locations.forEach(building => middle.extend(building.position));

    map = new google.maps.Map(document.getElementById('map'), {
        center: middle.getCenter(),
        zoom: 17, // 16 was not zoomed in enough, 17 was ok, 18 was too much, and decimals just zoomed in without adding detail
        disableDefaultUI: true,
        disableDoubleClickZoom: true, // turn off doubleclick for zoom
        gestureHandling: 'none', // turn off zoom + pan
        clickableIcons: false
    });

    map.addListener('dblclick', event => answer(event.latLng));
    startTime = Date.now();
    timerId = setInterval(updateTimer, 100);
    loadQuestion();
}

// swap the prompt text to the location we want to know about
function loadQuestion() {
    document.getElementById('location-question').textContent = locations[questionIndex].name;
}

// handle double click on the map: check if it was right and correspondingly draw the result
function answer(clickedLocation) {
    const target = locations[questionIndex];

    // bounds come from places api, so we check if the click is inside
    const correct = target.bounds.contains(clickedLocation);
    if (correct) {
        correctCount += 1;
    }

    // ternary: shade the answer area (green if right / red if wrong) using same bounds
    const color = correct ? '#70a65b' : '#d9534f';
    new google.maps.Rectangle({
        map, clickable: false, bounds: target.bounds,
        strokeColor: color, strokeWeight: 3, strokeOpacity: 0.95,
        fillColor: color, fillOpacity: 0.25
    });

    // drop animation with the marker api
    new google.maps.Marker({
        map,
        position: target.position,
        animation: google.maps.Animation.DROP
    });

    recordAnswer(target.name, correct);
    questionIndex += 1;

    if (questionIndex >= locations.length) endGame();
    else loadQuestion();
}

// tack the question + feedback pair onto the running history on the left side
function recordAnswer(question, correct) {
    const quizHistory = document.getElementById('quiz-history');

    const questionBar = document.createElement('div');
    questionBar.className = 'question-bar';
    questionBar.textContent = question;
    quizHistory.appendChild(questionBar);

    const feedbackBar = document.createElement('div');
    feedbackBar.className = 'feedback-bar ' + (correct ? 'correct' : 'incorrect');
    feedbackBar.textContent = correct ? 'Your answer is correct!!' : 'Sorry wrong location.';
    quizHistory.appendChild(feedbackBar);
}

// quiz is over, show the totals and the timer and check if it's a new best
function endGame() {
    clearInterval(timerId);
    google.maps.event.clearListeners(map, 'dblclick'); // no more clicks count
    const elapsedMilliseconds = Date.now() - startTime;

    document.getElementById('current-question').style.display = 'none';
    document.getElementById('score-result').textContent = `${correctCount} Correct, ${locations.length - correctCount} Incorrect`;
    document.getElementById('final-time').textContent = `Time: ${formatTime(elapsedMilliseconds)}`;

    if (saveBestResults(correctCount, elapsedMilliseconds)) {
        document.getElementById('new-best').textContent = 'New best score!';
    }
    displayBest();
    document.getElementById('score').style.display = 'block';
}

// fires every 100ms while the quiz is going to update the timer text
function updateTimer() {
    document.getElementById('timer').textContent = `Time: ${formatTime(Date.now() - startTime)}`;
}

// turns milliseconds into seconds with 1 decimal place
function formatTime(milliseconds) {
    return (milliseconds / 1000).toFixed(1) + 's';
}

// builds a LatLngBounds centered on the center param, sized to a fraction of the reference bounds
// using the location as the center guarantees the marker pin is inside the answer box
function boxAround(center, referenceBounds, fraction) {
    const northEast = referenceBounds.getNorthEast();
    const southWest = referenceBounds.getSouthWest();
    const halfLatitude = (northEast.lat() - southWest.lat()) * fraction / 2;
    const halfLongitude = (northEast.lng() - southWest.lng()) * fraction / 2;
    return new google.maps.LatLngBounds(
        { lat: center.lat() - halfLatitude, lng: center.lng() - halfLongitude },
        { lat: center.lat() + halfLatitude, lng: center.lng() + halfLongitude }
    );
}

// pulls saved high score, returns null if nothing's saved yet or the json got corrupted somehow
function getBestResults() {
    try { return JSON.parse(localStorage.getItem(SCORE_KEY)); }
    catch { return null; }
}

// only overwrites if this run actually beats the saved one
// ranking is most correct first, fastest time breaks ties
function saveBestResults(correct, elapsedMilliseconds) {
    const best = getBestResults();
    const beats = !best
        || correct > best.correct
        || (correct === best.correct && elapsedMilliseconds < best.elapsedMilliseconds);
    if (beats) {
        localStorage.setItem(SCORE_KEY, JSON.stringify({ correct, elapsedMilliseconds }));
    }
    return beats;
}

// writes the high score chip up top, or leaves it blank if there isn't one yet
function displayBest() {
    const best = getBestResults();
    document.getElementById('best').textContent = best
        ? `Best: ${best.correct}/${locations.length} in ${formatTime(best.elapsedMilliseconds)}`
        : '';
}

document.addEventListener('DOMContentLoaded', init);
