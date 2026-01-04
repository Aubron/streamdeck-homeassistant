#!/usr/bin/with-contenv bashio

# Read config options
export MQTT_HOST=$(bashio::config 'mqtt_host')
export MQTT_PORT=$(bashio::config 'mqtt_port')
export MQTT_USER=$(bashio::config 'mqtt_user')
export MQTT_PASSWORD=$(bashio::config 'mqtt_password')

# If no MQTT host specified, try to auto-discover from Mosquitto addon
if [ -z "$MQTT_HOST" ]; then
    if bashio::services.available "mqtt"; then
        export MQTT_HOST=$(bashio::services mqtt "host")
        export MQTT_PORT=$(bashio::services mqtt "port")
        export MQTT_USER=$(bashio::services mqtt "username")
        export MQTT_PASSWORD=$(bashio::services mqtt "password")
        bashio::log.info "Auto-discovered MQTT broker at ${MQTT_HOST}:${MQTT_PORT}"
    else
        bashio::log.warning "No MQTT broker configured and none auto-discovered"
    fi
fi

# Set data directory for persistence
export DATA_DIR="/share/streamdeck_manager"
mkdir -p "$DATA_DIR"

bashio::log.info "Starting Stream Deck Manager..."
cd /app
exec node dist/server.js
