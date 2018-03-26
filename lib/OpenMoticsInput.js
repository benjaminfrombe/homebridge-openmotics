'use strict';

const OM_MODULES = {
	'i': 'Virtual Input',
	'I': 'Normal Input'
}

function OpenMoticsInput(platform, id) {
	this.platform = platform;
	this._id = id;
	this._inputAccessory;
	this._hasRegistered = false;
};

OpenMoticsInput.prototype.initializeAccessory = function() {
	const id = this._id;
  	this.platform.log('Polling input ' + id);
  	// get input configuration via OpenMotics API
	return this.platform.request('get_input_configuration', {'id': id})
		.then(
			function(response) {
				this.setAccessory(
					this.createInputAccessory(response.config.name, response.config.module_type, id)
				);

				return this;
			}.bind(this),
			function(error) {
				this.log('Error OpenMoticsInput initializeAccessory ' + id + ': ' + error);
			}.bind(this)
		);
};

OpenMoticsInput.prototype.createInputAccessory = function(name, type, id) {
	const serialNumber = ['om', 'input', type, id].join('-');
	const uuid = UUIDGen.generate(serialNumber);
	const inputAccessory = new Accessory(name, uuid);

    // save input ID and class name in context for easy restoration from persistent storage
	// in configureAccessory()
    inputAccessory.context.id = id;
	inputAccessory.context.class = "OpenMoticsInput";

    // Set Information Service characteristics
    const inputInfoService = inputAccessory.getService(Service.AccessoryInformation);
    if (inputInfoService) {
      inputInfoService.setCharacteristic(Characteristic.Manufacturer, this.platform.config.manufacturer);
      inputInfoService.setCharacteristic(Characteristic.Model, OM_MODULES[type]);
      inputInfoService.setCharacteristic(Characteristic.SerialNumber, serialNumber);
    }
	const switchService = inputAccessory.addService(Service.StatelessProgrammableSwitch, name, serialNumber);
	if (switchService) {
		switchService.getCharacteristic(Characteristic.ProgrammableSwitchEvent)
			.setProps({
				minValue: Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS,
				maxValue: Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS,
				validValues: [
					Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS
				]
			});
		switchService.getCharacteristic(Characteristic.LabelIndex)
			.setValue(id);
	}

	return inputAccessory;
};

// get input accessory
OpenMoticsInput.prototype.getAccessory = function() {
	if (this._inputAccessory === undefined) {
		this.initializeAccessory(this._id);
	}
	return this._inputAccessory;
};

// set input accessory
OpenMoticsInput.prototype.setAccessory = function(accessory) {
	this._inputAccessory = accessory;
	this.setAccessoryEventHandlers();
};

// has input registered it's accessory with homebridge?
OpenMoticsInput.prototype.hasRegistered = function() {
	return this._hasRegistered;
};

// set input registered status of it's accessory with homebridge
OpenMoticsInput.prototype.setRegistered = function(status) {
	this._hasRegistered = status;
};

// set input event handlers
OpenMoticsInput.prototype.setAccessoryEventHandlers = function() {
	this.getAccessory().on('identify', function(paired, callback) {
		this.platform.log(this.getAccessory().displayName, "Identify input and paired = " + paired);
		callback();
	}.bind(this));
};

// inputStatus = [<input>, <output>]
OpenMoticsInput.prototype.heartbeat = function(input) {
	if (input == this._id) {
		const accessory = this.getAccessory();
		if (accessory) {
			this.getAccessory().getService(Service.StatelessProgrammableSwitch).getCharacteristic(Characteristic.ProgrammableSwitchEvent).updateValue(0); //single press
		}
	}
};

module.exports = OpenMoticsInput;
