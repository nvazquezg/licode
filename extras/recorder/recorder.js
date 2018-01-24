/*global require, __dirname, console*/
'use strict';
var express = require('express'),
    bodyParser = require('body-parser'),
    errorhandler = require('errorhandler'),
    morgan = require('morgan'),
    N = require('./nuve'),
    fs = require('fs'),
    config = require('./../../licode_config'),
    newIo = require('socket.io-client'),
    Erizo = require('./erizofc');

var options = {
    key: fs.readFileSync('../../cert/key.pem').toString(),
    cert: fs.readFileSync('../../cert/cert.pem').toString()
};

if (config.erizoController.sslCaCerts) {
    options.ca = [];
    for (var ca in config.erizoController.sslCaCerts) {
        options.ca.push(fs.readFileSync(config.erizoController.sslCaCerts[ca]).toString());
    }
}
var room = '';

var app = express();

// app.configure ya no existe
app.use(errorhandler({
    dumpExceptions: true,
    showStack: true
}));
app.use(morgan('dev'));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
    extended: true
}));
app.use(function(req, res, next) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});


//app.set('views', __dirname + '/../views/');
//disable layout
//app.set("view options", {layout: false});

N.API.init(config.nuve.superserviceID, config.nuve.superserviceKey, 'http://localhost:3000/');

var connect = function(token) {
    room = Erizo.Room(newIo, undefined, {token:token});

    room.addEventListener("room-connected", onConnected);
    room.addEventListener('stream-added', onAddStream);
    room.addEventListener('stream-removed', onRemoveStream);
    room.addEventListener('stream-subscribed', onStreamSubscribed);
    room.connect();
    //console.log('ROOM', room);
};

var onConnected = function(event) {
    console.log('CONNECTED', event);
    var streams = room.getStreamsByAttribute();
    console.log('STREAMS1', streams);
    for(let s of streams){
        console.log('STREAM1', s.getID());
        if(s.recording !== 'undefined') {
            startRecording(s);
        }
    }
    console.log('ROOM', room);
    console.log('ROOM', room.remoteStreams);
};

var onAddStream = function(event) {
    console.log('ADDSTREAM', event);
    console.log('ROOM', room);
    console.log('ROOM2', event.stream.room);
    var streams = room.getStreamsByAttribute();
    console.log('STREAMS', streams);
    for(let s of streams){
        console.log('STREAM', s.getID())
        if(s.recording !== 'undefined') {
            startRecording(s);
        }
    }
    //event.stream.addEventListener('stream-data', onData);
    //room.subscribe(event.stream);
    //startRecording(event.stream);
};

var onRemoveStream = function(event) {
    console.log('REMOVESTREAM', event);
};

var onStreamSubscribed = function(event) {
    console.log('STREAMSUBSCRIBED', event);
};

var onData = function(event) {
    console.log('DATA', event);
};

var startRecording = function(stream) {
    console.log('STARTRECORDING', stream);
    room.startRecording(stream, function(id) {
        console.log('STREAM', stream, 'ID', id);
    });
};

app.post('/record/', function(req, res) {
    console.log('Starting recording: ',req.body);

    if(!req.body.idSala){
        console.log('Missing required parameter idSala');
        res.status(422).send('Missing required parameter');
        return;
    }

    var createToken = function (roomId) {

        N.API.createToken(roomId, 'recorder', 'presenter', function(token) {
            console.log('Token created', token);
            connect(token);
            //res.send(token);
        }, function(error) {
            console.log('Error creating token', error);
            res.status(401).send('No Erizo Controller found');
        });
    };

    var getRoom = function (name, callback) {

        N.API.getRooms(function (roomlist){
            var theRoom = '';
            var rooms = JSON.parse(roomlist);
            console.log(rooms);
            for (var room of rooms) {
                console.log(room.name, name);
                if (room.name === name){

                    theRoom = room._id;
                    callback(theRoom);
                    return;
                }
            }

            console.log('Room not found', name);
            res.status(404).send('Room not found');
        });
    };

    getRoom(+req.body.idSala, createToken);
});


app.use(function(req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS, DELETE');
    res.header('Access-Control-Allow-Headers', 'origin, content-type');
    if (req.method === 'OPTIONS') {
        res.send(200);
    } else {
        next();
    }
});

app.listen(3002);

