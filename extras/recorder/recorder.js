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

//TODO: Vbles a mongo?
var roomsRecording = {};
var recordings = {};

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

var onAddStream = function(event) {
    //console.log('ADDSTREAM', event);
    startRecording(event.stream);
};

var onRemoveStream = function(event) {
    console.log('REMOVESTREAM', event);
    // stopRecording(event.stream);
};

var onStreamSubscribed = function(event) {
    console.log('STREAMSUBSCRIBED', event);
};

var onData = function(event) {
    console.log('DATA', event);
};

var initRecording = function(room, stream, callback) {
    // console.log('INITRECORDING-ROOM', room);
    // console.log('INITRECORDING-STREAM', stream);
    if(recordings[stream.getID()]) {
        console.log('Already recording stream', stream.getID(), recordings[stream.getID()]);
        callback('Already recording stream');
        //TODO
    }

    room.startRecording(stream, function(id) {
        console.log('INIT STREAM: ', stream.getID(), 'RECORDING:', id);
        recordings[stream.getID()] = id;
    }, callback);
};

var startRecording = function(stream, callback) {
    //console.log('STARTRECORDING', stream);
    if(recordings[stream.getID()]) {
        console.log('Already recording stream', stream.getID(), recordings[stream.getID()]);
        callback('Already recording stream');
        //TODO
    }

    stream.room.startRecording(stream, function(id) {
        console.log('START STREAM: ', stream.getID(), 'RECORDING:', id);
        recordings[stream.getID()] = id;
    }, callback);
};

var stopRecording = function(room, stream) {
    //console.log('STOPRECORDING', stream);
    //TODO: check if not recording?
    room.stopRecording(recordings[stream.getID()], function(id) {
        console.log('STOPPED STREAM: ', stream.getID(), 'RECORDING:', id);
        delete recordings[stream.getID()];
    }, function (err) {
        console.log(err);
    });
};

app.post('/record/stop', function(req, res) {
    console.log('Stopping recording: ', req.body);

    if(!req.body.idSala){
        console.log('Missing required parameter idSala');
        res.status(422).send('Missing required parameter');
        return;
    }

    let room = roomsRecording[req.body.idSala];

    if(typeof roomsRecording[req.body.idSala] === 'undefined') {
        console.log('Sala not recording');
        res.status(409).send({result: 'Not recording'});
        return;
    } else if (roomsRecording[req.body.idSala].roomID === 'unloading') {
        // roomsRecording[req.body.idSala] = {roomID: 'stuck'};
        console.log('Sala already stopping');
        res.status(409).send({result: 'Already stopping', data: roomsRecording[req.body.idSala].roomID});
        return;
    } else if (roomsRecording[req.body.idSala].roomID === 'loading') {
        console.log('Sala just starting recording');
        res.status(409).send({result: 'Just started recording', data: roomsRecording[req.body.idSala].roomID});
        return;
    }
    else if (room.state !== 2) {
        console.log('Not connected to Room');
        res.status(409).send({result: 'Not connected to Room', data: roomsRecording[req.body.idSala].roomID});
        return;
    }
    else { //Evitar condiciones de carrera
        //roomsRecording[req.body.idSala] = {roomID: 'unloading'};
    }

    room.remoteStreams.forEach(function(value, index) {
        console.log('STREAM', index, value);
        stopRecording(room, value);
    });

    //TODO:
    setTimeout(function() {
        console.log('DISCONNECT', room.roomID);
        room.disconnect();
        console.log('DELETE FROM GLOBAL LIST');
        delete roomsRecording[req.body.idSala]
    }, 10000);
});

app.post('/record/start', function(req, res) {
    console.log('Starting recording: ',req.body);

    if(!req.body.idSala){
        console.log('Missing required parameter idSala');
        res.status(422).send('Missing required parameter');
        return;
    }
    if(roomsRecording[req.body.idSala]) {
        console.log('Sala already recording');
        res.status(409).send({result: 'Already recording', data: roomsRecording[req.body.idSala].roomID});
        return;
    } else { //Evitar condiciones de carrera
        roomsRecording[req.body.idSala] = {roomID: 'loading'};
    }

    var createToken = function (roomId, idSala) {
        console.log('Creating token');
        N.API.createToken(roomId, 'recorder', 'presenter', function(token) {
            console.log('Token ready', token);
            connect(token, idSala);
            res.status(200).send({result: 'OK', token: token, idSala: idSala});
        }, function(error) {
            console.log('Error creating token', error);
            res.status(401).send({result: 'Error creating token', error: error});
        });
    };

    var getRoom = function (name, callback) {
        N.API.getRooms(function (roomlist){
            const rooms = JSON.parse(roomlist);
            for (var room of rooms) {
                if (room.name === name){

                    callback(room._id, name);
                    return;
                }
            }

            console.log('Room not found', name);
            res.status(404).send('Room not found');
        });
    };

    getRoom(+req.body.idSala, createToken);
});

app.get('/record/list', function(req, res) {
    let result = {};
    Object.keys(roomsRecording).forEach(function(key) {
        result[key] = roomsRecording[key].roomID;
    });
    res.status(200).send(result);
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

var connect = function(token, idSala) {
    let room = Erizo.Room(newIo, undefined, {token:token});

    //room-connected no trae room definido, así que se implementa aquí la función para tener room en el ámbito
    room.addEventListener("room-connected", function(event) {
        //console.log('CONNECTED', event);
        console.log('CONNECTED TO ROOM: ', room.roomID);

        for(let s of event.streams) {
            //console.log('STREAM1', s.getID());
            initRecording(room, s);
        }
    });
    room.addEventListener('stream-added', onAddStream);
    room.addEventListener('stream-removed', onRemoveStream);
    room.addEventListener('stream-subscribed', onStreamSubscribed);
    room.connect();

    //Guardar la sala en el ámbito global para poder monitorizarlas
    //roomsRecording[room.roomID] = room;
    roomsRecording[idSala] = room;
    //console.log('ROOM', room);
};

app.listen(3002);

