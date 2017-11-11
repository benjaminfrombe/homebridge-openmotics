'use strict';

const OM_MODULES = {
	'D': 'Normal Dimmer',
	'd': 'Virtual Dimmer',
	'O': 'Normal Output',
	'o': 'Virtual Dimmer'
}

function OpenMoticsOutput(platform, id) {
	platform.log('OpenMoticsOutput constructor called with id = ' + id);
	this.platform = platform;
	this._id = id;
	this._outputAccessory;
	this._hasRegistered = false;
};

OpenMoticsOutput.prototype.initializeAccessory = function() {
	const id = this._id;
  	this.platform.log('Polling output ' + id);
  	// get output configuration via OpenMotics API
  	return this.platform.request('get_output_configuration', {'id': id})
		.then(
			function(response) {
				this.setAccessory(
					this.createOutputAccessory(response.config.name, response.config.module_type, id)
				);

				return this;
			}.bind(this),
			function(error) {
				this.log('Error OpenMoticsOutput initializeAccessory ' + id + ': ' + error);
			}.bind(this)
		);
};

OpenMoticsOutput.prototype.createOutputAccessory = function(name, type, id) {
	const serialNumber = ['om', 'output', type, this._id].join('-');
	const uuid = UUIDGen.generate(serialNumber);
	const outputAccessory = new Accessory(name, uuid);

    // save output ID and class name in context for easy restoration from persistent storage
    // in configureAccessory()
    outputAccessory.context.id = id;
    outputAccessory.context.class = "OpenMoticsOutput";

    // Set Information Service characteristics
    const outputInfoService = outputAccessory.getService(Service.AccessoryInformation);
    if (outputInfoService) {
		outputInfoService.setCharacteristic(Characteristic.Manufacturer, this.platform.config.manufacturer);
		outputInfoService.setCharacteristic(Characteristic.Model, OM_MODULES[type]);
		outputInfoService.setCharacteristic(Characteristic.SerialNumber, serialNumber);
    }

	const lightbulbService = outputAccessory.addService(Service.Lightbulb, name);

	return outputAccessory;
};

// get output accessory
OpenMoticsOutput.prototype.getAccessory = function() {
  return this._outputAccessory;
};

// get output accessory
OpenMoticsOutput.prototype.setAccessory = function(accessory) {
  this._outputAccessory = accessory;
  this.setAccessoryEventHandlers();
};

// has gateway registered it's accessory with homebridge?
OpenMoticsOutput.prototype.hasRegistered = function() {
  return this._hasRegistered;
};

// set gateway registered status of it's accessory with homebridge
OpenMoticsOutput.prototype.setRegistered = function(status) {
  this._hasRegistered = status;
};

OpenMoticsOutput.prototype.setAccessoryEventHandlers = function() {
	this.getAccessory().on('identify', function(paired, callback) {
		this.platform.log(this.getAccessory().displayName, "Identify output and paired = " + paired);
		callback();
	}.bind(this));

	this.getAccessory().getService(Service.Lightbulb).getCharacteristic(Characteristic.On)
		.on('set', function(value, callback) {
			var strValue = (value) ? "true" : "false";
			this.platform.request('set_output', {'id': this.getAccessory().context.id, 'is_on': strValue})
				.then(
					function(response) {
						this.platform.log(this.getAccessory().displayName, "OpenMotics response = " + JSON.stringify(response));
					}.bind(this),
					function(error) {
						this.platform.log(this.getAccessory().displayName, "Error set " + value);
					}.bind(this)
				);
			callback();
		}.bind(this));
};

// outputStatus = {"status": 0, "dimmer": 100, "ctimer": 21600, "id": <output>}
OpenMoticsOutput.prototype.heartbeat = function(outputStatus) {
	if (outputStatus.id == this._id) {
		const status = outputStatus.status;
		const accessory = this.getAccessory();
		if (accessory) {
			accessory.getService(Service.Lightbulb).getCharacteristic(Characteristic.On).updateValue(status);
		}
	}
};

module.exports = OpenMoticsOutput;
