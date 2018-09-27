FROM ubuntu:16.04

MAINTAINER Lynckia

WORKDIR /opt

# Download latest version of the code and install dependencies
RUN  apt-get update && apt-get install -y git wget curl

COPY .nvmrc package.json /opt/licode/

COPY scripts/installUbuntuDeps.sh scripts/checkNvm.sh /opt/licode/scripts/

WORKDIR /opt/licode/scripts

RUN ./installUbuntuDeps.sh --cleanup --fast

WORKDIR /opt

RUN curl -sL https://deb.nodesource.com/setup_8.x | sudo -E bash -
RUN sudo apt-get install -y nodejs
RUN npm install pm2@latest -g

COPY . /opt/licode

RUN mkdir /opt/licode/.git

# Clone and install licode
WORKDIR /opt/licode/scripts

RUN ./installErizo.sh -dfeacs && \
    ./../nuve/installNuve.sh && \
    ./installRecorder.sh

# Add crontab file in the cron directory
ADD crontab /etc/cron.d/cleanupPods

# Give execution rights on the cron job
RUN chmod 0644 /etc/cron.d/cleanupPods
RUN touch /var/log/cron.log

RUN service cron start


WORKDIR /opt

RUN git clone http://gitlab+deploy-token-3:z5Efi6CeUKPggzFK8csm@gitlab.intecca.local/aplicaciones/ackuaria.git
WORKDIR /opt/ackuaria
RUN npm install

WORKDIR /opt

ENTRYPOINT ["./licode/extras/docker/initDockerLicode.sh"]
