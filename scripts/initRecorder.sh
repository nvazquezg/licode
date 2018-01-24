#!/usr/bin/env bash

SCRIPT=`pwd`/$0
FILENAME=`basename $SCRIPT`
PATHNAME=`dirname $SCRIPT`
ROOT=$PATHNAME/..
BUILD_DIR=$ROOT/build
CURRENT_DIR=`pwd`
NVM_CHECK="$PATHNAME"/checkNvm.sh
EXTRAS=$ROOT/extras

cp $ROOT/nuve/nuveClient/dist/nuve.js $EXTRAS/recorder/
cp $ROOT/erizo_controller/erizoClient/dist/production/erizofc/erizofc.js $EXTRAS/recorder/

. $NVM_CHECK

nvm use
cd $EXTRAS/recorder
node recorder.js &
