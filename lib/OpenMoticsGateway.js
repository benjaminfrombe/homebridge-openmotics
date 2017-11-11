'use strict';

function OpenMoticsGateway(platform) {
	platform.log('OpenMoticsGateway constructor');
	this.platform = platform;
	this._gatewayAccessory;
	this._hasRegistered = false;
};

OpenMoticsGateway.prototype.initializeAccessory = function() {
	// get the version and hw_version from the gateway via OpenMotics API
	return this.platform.request('get_status', {})
		.then(
			function(response) {
				this.platform.log('Gateway status = ' + JSON.stringify(response));

				this.setAccessory(
					this.createGatewayAccessory(response.version, "v" + response.hw_version)
				);

				return this;
			}.bind(this),
			function(error) {
				this.log('Error OpenMoticsGateway initializeAccessory: ' + error);
			}.bind(this)
		);
};

OpenMoticsGateway.prototype.createAccessory = function(version, hw_version) {
	const gatewaySerialNumber = this.platform.config.serialNumber;
	const uuid = UUIDGen.generate(gatewaySerialNumber);
	const gatewayName = this.platform.config.name;
	const gatewayAccessory = new Accessory(gatewayName, uuid);

	// save serialNumber in context.id for easy identification in configureAccessory()
	gatewayAccessory.context.id = gatewaySerialNumber;
	gatewayAccessory.context.class = "OpenMoticsGateway";

	// Set Information Service characteristics
	const gatewayInfoService = gatewayAccessory.getService(Service.AccessoryInformation);
	if (gatewayInfoService) {
		gatewayInfoService.setCharacteristic(Characteristic.Manufacturer, this.platform.config.manufacturer);
		gatewayInfoService.setCharacteristic(Characteristic.Model, this.platform.config.model);
		gatewayInfoService.setCharacteristic(Characteristic.SerialNumber, gatewaySerialNumber);
		gatewayInfoService.setCharacteristic(Characteristic.FirmwareRevision, version)
		gatewayInfoService.setCharacteristic(Characteristic.HardwareRevision, hw_version);
	}

	const gatewayServiceLabel = gatewayAccessory.addService(Service.ServiceLabel, gatewayName, 'OMGateway');
	if (gatewayServiceLabel) {
		gatewayServiceLabel.setCharacteristic(Characteristic.ServiceLabelNamespace, Characteristic.ServiceLabelNamespace.DOTS);
	}

	return gatewayAccessory;
};

// get gateway accessory
OpenMoticsGateway.prototype.getAccessory = function() {
	return this._gatewayAccessory;
};

// get gateway accessory
OpenMoticsGateway.prototype.setAccessory = function(accessory) {
	this._gatewayAccessory = accessory;
	this.setAccessoryEventHandlers();
};

// has gateway registered it's accessory with homebridge?
OpenMoticsGateway.prototype.hasRegistered = function() {
	return this._hasRegistered;
};

// set gateway registered status of it's accessory with homebridge
OpenMoticsGateway.prototype.setRegistered = function(status) {
	this._hasRegistered = status;
};

OpenMoticsGateway.prototype.setAccessoryEventHandlers = function() {
	this.getAccessory().on('identify', function(paired, callback) {
		this.platform.log(this.getAccessory().displayName, "Identify gateway and paired = " + paired);
		callback();
	}.bind(this));
};

module.exports = OpenMoticsGateway;
