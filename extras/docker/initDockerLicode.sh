#!/usr/bin/env bash
SCRIPT=`pwd`/$0
ROOT=/opt/licode
SCRIPTS="$ROOT"/scripts
BUILD_DIR="$ROOT"/build
DB_DIR="$BUILD_DIR"/db
EXTRAS="$ROOT"/extras
NVM_CHECK="$ROOT"/scripts/checkNvm.sh
SERVID=""
SERVKEY=""

# initialize pm2
/usr/bin/pm2 status
sleep 5

parse_arguments(){
  if [ -z "$1" ]; then
    echo "No parameters -- starting everything"
    MONGODB=true
    RABBITMQ=true
    NUVE=true
    ERIZOCONTROLLER=true
    ERIZOAGENT=true
    BASICEXAMPLE=false
    ERIZODEBUG=false
    RECORDER=true
    ACKUARIA=true
    METRICS=true

  else
    while [ "$1" != "" ]; do
      case $1 in
        "--mongodb")
        MONGODB=true
        ;;
        "--rabbitmq")
        RABBITMQ=true
        ;;
        "--nuve")
        NUVE=true
        ;;
        "--erizoController")
        ERIZOCONTROLLER=true
        ;;
        "--erizoAgent")
        ERIZOAGENT=true
        ;;
        "--erizoDebug")
        ERIZODEBUG=true
        ;;
        "--basicExample")
        BASICEXAMPLE=true
        ;;
        "--recorder")
        RECORDER=true
        ;;
        "--ackuaria")
        ACKUARIA=true
        ;;
        "--metrics")
        METRICS=true
        ;;
      esac
      shift
    done
  fi
}

run_nvm() {
  echo "Running NVM"
  . $ROOT/build/libdeps/nvm/nvm.sh

}
check_result() {
  if [ "$1" -eq 1 ]
  then
    exit 1
  fi
}
run_rabbitmq() {
  echo "Starting Rabbitmq"
  rabbitmq-server -detached
  sleep 3
}

run_mongo() {
  if ! pgrep mongod; then
    echo [licode] Starting mongodb
    if [ ! -d "$DB_DIR" ]; then
      mkdir -p "$DB_DIR"/db
    fi
    mongod --repair --dbpath $DB_DIR
    mongod --nojournal --dbpath $DB_DIR --logpath $BUILD_DIR/mongo.log --fork
    sleep 5
  else
    echo [licode] mongodb already running
  fi

  dbURL=`grep "config.nuve.dataBaseURL" $SCRIPTS/licode_default.js`

  dbURL=`echo $dbURL| cut -d'"' -f 2`
  dbURL=`echo $dbURL| cut -d'"' -f 1`

  echo [licode] Checking superservice in $dbURL

  COUNT_KEYS=`mongo $dbURL --quiet  --eval "db.services.count()"`
  if [ "$COUNT_KEYS" -eq "0" ]; then
    echo [licode] Creating superservice in $dbURL
    mongo $dbURL --eval "db.services.insert({name: 'superService', key: '$RANDOM', rooms: []})"
  fi

  SERVID=`mongo $dbURL --quiet --eval "db.services.findOne()._id"`
  SERVKEY=`mongo $dbURL --quiet --eval "db.services.findOne().key"`

  SERVID=`echo $SERVID| cut -d'"' -f 2`
  SERVID=`echo $SERVID| cut -d'"' -f 1`

  if [ -f "$BUILD_DIR/mongo.log" ]; then
    echo "Mongo Logs: "
    cat $BUILD_DIR/mongo.log
  fi

  echo [licode] SuperService ID $SERVID
  echo [licode] SuperService KEY $SERVKEY
  cd $BUILD_DIR
  replacement=s/_auto_generated_ID_/${SERVID}/
  sed $replacement $SCRIPTS/licode_default.js > $BUILD_DIR/licode_1.js
  replacement=s/_auto_generated_KEY_/${SERVKEY}/
  sed $replacement $BUILD_DIR/licode_1.js > $ROOT/licode_config.js
  rm $BUILD_DIR/licode_1.js

}
run_nuve() {
  echo "Starting Nuve"
  cd $ROOT/nuve/nuveAPI
  /usr/bin/pm2 start
  sleep 5
}
run_erizoController() {
  echo "Starting erizoController"
  cd $ROOT/erizo_controller/erizoController
  /usr/bin/pm2 start
}
run_erizoAgent() {
  echo "Starting erizoAgent"
  cd $ROOT/erizo_controller/erizoAgent
  if [ "$ERIZODEBUG" == "true" ]; then
    node erizoAgent.js -d &
  else
    /usr/bin/pm2 start
  fi
}
run_basicExample() {
  echo "Starting basicExample"
  sleep 5
  cp $ROOT/nuve/nuveClient/dist/nuve.js $EXTRAS/basic_example/
  cd $EXTRAS/basic_example
  node basicServer.js &
}
run_recorder() {
  echo "Starting recorder"
  sleep 5
  cp $ROOT/nuve/nuveClient/dist/nuve.js $EXTRAS/recorder/
  cp $ROOT/erizo_controller/erizoClient/dist/production/erizofc/erizofc.js $EXTRAS/recorder/
  cd $EXTRAS/recorder
  /usr/bin/pm2 start ecosystem.config.js --env $ENVIRONMENT
}
run_ackuaria() {
  echo "Starting ackuaria"
  sleep 5
  cd /opt/ackuaria
  cp $ROOT/nuve/nuveClient/dist/nuve.js .

  replacement=s/^config\.nuve\.superserviceID.*/config\.nuve\.superserviceID\=\'${SERVID}\'\;/
  sed $replacement ackuaria_config.js.template > ackuaria_config.js.tmp
  replacement=s/^config\.nuve\.superserviceKey.*/config\.nuve\.superserviceKey\=\'${SERVKEY}\'\;/
  sed $replacement ackuaria_config.js.tmp > ackuaria_config.js
  rm ackuaria_config.js.tmp

  sed -i "s/^config.ackuaria.useDB = false;/config.ackuaria.useDB = true;/" ackuaria_config.js

  /usr/bin/pm2 start
}

run_metrics() {
  echo "Starting ROV metrics"
  cd $ROOT/erizo_controller/ROV
#  if [ "$ERIZODEBUG" == "true" ]; then
#    node inspector.js -d &
#    node rovMetricsServer.js -d &
#  else
    /usr/bin/pm2 start
#  fi
}

parse_arguments $*

cd $ROOT/scripts

run_nvm
nvm use

if [ "$MONGODB" == "true" ]; then
  run_mongo
fi

if [ "$RABBITMQ" == "true" ]; then
  run_rabbitmq
fi

if [ ! -f "$ROOT"/licode_config.js ]; then
    cp "$SCRIPTS"/licode_default.js "$ROOT"/licode_config.js
fi

if [ ! -f "$ROOT"/rtp_media_config.js ]; then
  cp "$SCRIPTS"/rtp_media_config_default.js "$ROOT"/rtp_media_config.js
fi

if [ "$NUVE" == "true" ]; then
  run_nuve
fi

if [ "$ERIZOCONTROLLER" == "true" ]; then
  echo "config.erizoController.port = '$ERIZO_PORT';" >> /opt/licode/licode_config.js
  echo "config.erizoController.publicIP = '$PUBLIC_IP';" >> /opt/licode/licode_config.js
  echo "config.erizoController.ssl = true;" >> /opt/licode/licode_config.js
  echo "config.erizoController.listen_ssl = true;" >> /opt/licode/licode_config.js
  echo "config.erizoController.hostname = '$PUBLIC_HOSTNAME';" >> /opt/licode/licode_config.js
  echo "config.erizoController.allowSinglePC = $SINGLE_PC;" >> /opt/licode/licode_config.js
  run_erizoController
fi

if [ "$ERIZOAGENT" == "true" ]; then
  if [[ ! -z "$PUBLIC_IP" ]]; then
    echo "config.erizoAgent.publicIP = '$PUBLIC_IP';" >> /opt/licode/licode_config.js
  fi
  if [[ ! -z "$MIN_PORT" ]]; then
    echo "config.erizo.minport = '$MIN_PORT';" >> /opt/licode/licode_config.js
  fi
  if [[ ! -z "$MAX_PORT" ]]; then
    echo "config.erizo.maxport = '$MAX_PORT';" >> /opt/licode/licode_config.js
  fi
  if [[ ! -z "$NETWORK_INTERFACE" ]]; then
    echo "config.erizo.networkinterface = '$NETWORK_INTERFACE';" >> /opt/licode/licode_config.js
  fi
  if [[ ! -z "$MAX_PROCESSES" ]]; then
    echo "config.erizoAgent.maxProcesses = $MAX_PROCESSES;" >> /opt/licode/licode_config.js
  fi
  run_erizoAgent
fi

if [ "$BASICEXAMPLE" == "true" ]; then
  run_basicExample
fi

if [ "$RECORDER" == "true" ]; then
  run_recorder
fi

if [ "$ACKUARIA" == "true" ]; then
  run_ackuaria
fi

if [ "$METRICS" == "true" ]; then
  run_metrics
fi

#Collectd configuration
if ! [ -z "$PRIVATE_HOSTNAME" ]; then
    sed -i "s/^#Hostname.*$/Hostname \"$PRIVATE_HOSTNAME\"/" /etc/collectd/collectd.conf
    sed -i "s/^FQDNLookup true$/#FQDNLookup true/" /etc/collectd/collectd.conf
    sed -i "s/^#LoadPlugin network$/LoadPlugin network/" /etc/collectd/collectd.conf
    sed -i "s/^#LoadPlugin exec$/LoadPlugin exec/" /etc/collectd/collectd.conf
    sed -i "s/^#LoadPlugin tcpconns$/LoadPlugin tcpconns/" /etc/collectd/collectd.conf

    if grep -q "Server \"$COLLECTD_IP\" \"$COLLECTD_PORT\"" /etc/collectd/collectd.conf
    then
        echo "Collectd network: Ya configurado"
    else
        echo "
        <Plugin network>
            Server \"$COLLECTD_IP\" \"$COLLECTD_PORT\"
        </Plugin> " >> /etc/collectd/collectd.conf
    fi

    if grep -q "Exec \"daemon\" \"/opt/usageLicode.sh\"" /etc/collectd/collectd.conf
    then
        echo "Collectd exec: Ya configurado"
    else
        echo "
        <Plugin exec>
            Exec \"daemon\" \"/opt/usageLicode.sh\"
        </Plugin> " >> /etc/collectd/collectd.conf
    fi
fi

##  En cron, y collect no se ven las variables se se pasan por docker -> crearlas al comienzo de los scripts.

printenv|egrep  'HOST|PORT' > /etc/cron.d/schedules.tmp
# coge partir de la primera ocurrencia de minuto o root para no repetir variables tras varias ejecuciones.
egrep 'minuto|root' -A 1000 /etc/cron.d/schedules >> /etc/cron.d/schedules.tmp
mv /etc/cron.d/schedules.tmp /etc/cron.d/schedules

printenv|egrep  'HOST|PORT' > /opt/portsUDP.sh.tmp
# coge partir de la primera ocurrencia /proc no repetir variables tras varias ejecuciones.
egrep '/proc' -A 1000 /opt/portsUDP.sh >> /opt/portsUDP.sh.tmp
mv /opt/portsUDP.sh.tmp /opt/portsUDP.sh

#start services
service cron start
service collectd start

/usr/bin/pm2 log

wait
