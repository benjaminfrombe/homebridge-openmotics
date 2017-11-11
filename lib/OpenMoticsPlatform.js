'use strict';

const https = require('https');
const OpenMoticsGateway = require('./OpenMoticsGateway');
const OpenMoticsOutput = require('./OpenMoticsOutput');
const OpenMoticsInput = require('./OpenMoticsInput');


function OpenMoticsPlatform(log, config, api) {
	//log('OpenMoticsPlatform called with config = ' + JSON.stringify(config));
	this.log = log;
	this.config = config;

	// initialize token for gateway API
	this.token = {'value': false, 'expires': Date.now(), 'asked': false};

	// keep track of all accessories
	//this.accessories = [];

	// initialize gateway
	this.gateway = new OpenMoticsGateway(this);

	// initialize outputs
	this.outputs = {};
	this.config.outputs.forEach(function(outputID) {
		this.outputs[outputID] = new OpenMoticsOutput(this, outputID);
	}.bind(this));

	// initialize inputs
	this.inputs = {};
	this.config.inputs.forEach(function(inputID) {
		this.inputs[inputID] = new OpenMoticsInput(this, inputID);
	}.bind(this));


	if (api) {
		// Save the API object as plugin needs to register new accessory via this object.
		this.api = api;

		// Listen to event "didFinishLaunching", this means homebridge already finished loading cached accessories
		// Platform Plugin should only register new accessory that doesn't exist in homebridge after this event.
		// Or start discover new accessories
		this.api.on('didFinishLaunching', this.registerAccessories.bind(this));
		this.api.on('didFinishLaunching', this.heartbeat.bind(this));
	}
};

// run
OpenMoticsPlatform.prototype.heartbeat = function() {
	if ( (Object.keys(this.inputs).length + Object.keys(this.outputs).length) > 0 ) {
     	// Setup heartbeat.
     	let beat = -1;
		// beat every second
		setInterval(function() {
	        beat += 1;
	        beat %= 1 * 24 * 60 * 60; // reset after 1 day

	        this.heartbeatOutputs(beat);
	        this.heartbeatInputs(beat);
	      }.bind(this), 1000);
	}
};

OpenMoticsPlatform.prototype.registerAccessories = function() {
	this.log("DidFinishLaunching");
	let name = this.config.name;
	let id = this.config.serialNumber;
	let promisedAccessories = [];

	// initialize gateway accessory
	if (!this.gateway.hasRegistered()) {
		this.log("OpenMoticsPlatform found a new Gateway '" + name + "' with Serial Number = '" + id + "'");
		promisedAccessories.push(this.gateway.initializeAccessory());
	}
	else {
		this.log("Gateway '" + name + "' already created");
	}

	// initialize output accessories
	this.config.outputs.forEach(function(outputID) {
		let output = this.outputs[outputID];
		if (!output.hasRegistered()) {
			promisedAccessories.push(output.initializeAccessory());
		}
	}.bind(this));
	// initialize input accessories
	this.config.inputs.forEach(function(inputID) {
		let input = this.inputs[inputID];
		if (!input.hasRegistered()) {
			promisedAccessories.push(input.initializeAccessory());
		}
	}.bind(this));


	// collect all accessories after they have been initialized and register them with homebridge
	if (promisedAccessories.length > 0) {
		Promise.all(promisedAccessories)
			.then(
				function (omObjects) {
					let newAccessories = omObjects.map(function (omObject) {
						omObject.setRegistered(true);
						return omObject.getAccessory();
					});
					this.api.registerPlatformAccessories("homebridge-openmotics", "OpenMotics", newAccessories);
				}.bind(this),
				function(error) {
					this.log('Error promisedAccessories: ' + error);
				}.bind(this)
			);
	}
};

// restore from persistent storage
OpenMoticsPlatform.prototype.configureAccessory = function(accessory) {
	this.log("Restoring accessory: " + accessory.displayName);
	if (accessory.context.class == "OpenMoticsGateway") {
		const gateway = this.gateway;
		gateway.setAccessory(accessory);
		gateway.setRegistered(true);
	}
	else if (accessory.context.class == "OpenMoticsOutput") {
		const output = this.outputs[accessory.context.id];
		output.setAccessory(accessory);
		output.setRegistered(true);
	}
	else if (accessory.context.class == "OpenMoticsInput") {
		const input = this.inputs[accessory.context.id];
		input.setAccessory(accessory);
		input.setRegistered(true);
	}
	else {
		this.log('Accessory ' + accessory.displayName + ' is of an unknown class "' + accessory.context.class + '"');
	}
	accessory.updateReachability(true);
};

// communicate with gateway over https, login and get token first (valid for 1h)
OpenMoticsPlatform.prototype.request = function(command, params) {
	return this.getToken()
		.then(
			function(token) {
				if (token) {
					params.token = token;
					return this._request(command, params);
				}
				else {
					this.log('Unable to get token');
				}
			}.bind(this),
			function (error) {
				this.log('request getToken error: ' + error);
			}
		);
};

// promise https request
OpenMoticsPlatform.prototype._request = function(command, params) {
	return new Promise((resolve, reject) => {
		let paramArray = [];

		for (var param in params) {
			paramArray.push(param + '=' + params[param]);
		}
    
		const path = '/' + command + '?' + paramArray.join('&');

		//this.log('Sending command ' + path);

		https.get({
			hostname: this.config.hostname,
			path: path,
			port: 443,
			rejectUnauthorized: false,
			headers: {
				'Content-Type': 'application/json'
			}
		},
		(res) => {
			var response = '';
			res.setEncoding('utf8');
			res.on('data', (chunk) => {
				response += chunk;
			});
			res.on('end', () => {
				resolve(JSON.parse(response));
			});
			res.on('error',  function (e) {
				reject(this.log(`Error with https request: ${e.message}`));
			}.bind(this));
		});
	});
};

// set token and timer for 59min
OpenMoticsPlatform.prototype.setToken = function(token) {
	this.token.value = token;
	this.token.expires = Date.now() + (59 * 60 * 1000);
	this.setAskedToken(false); // reset because we have the answer now
};

// check if token is valid
OpenMoticsPlatform.prototype.hasInvalidToken = function() {
	if (this.token && this.token.value && (this.token.expires > Date.now())) {
		return false;
	}
	return true;
};

OpenMoticsPlatform.prototype.alreadyAskedToken = function() { 
	return this.token.asked;
};


OpenMoticsPlatform.prototype.setAskedToken = function(value) { 
	this.token.asked = value;
};

// get token value
OpenMoticsPlatform.prototype.getToken = function() {
	return new Promise((resolve, reject) => {
		if (this.hasInvalidToken()) {
			if (!this.alreadyAskedToken()) {
				// do the request for the token
				this.loginRequest = this._request('login', {'username': this.config.username, 'password': this.config.password})
					.then(
						function(response) {
							if (response.success) {
								this.setToken(response.token);
								this.log('setting token = "' + response.token + '"');
								return response.token;
							}
							else {
								return false;
							}
						}.bind(this),
						function(error) {
							this.log('Error in getToken resolve 1st login request: ' + error);
						}.bind(this)
					);
				this.setAskedToken(true);
			}
			else {
				// no need to request a new token, we're still waiting
				this.log('no need to request a new token, we are still waiting');
			}
			// wait for the answer
			resolve(this.loginRequest);
		}
		else {
			resolve(this.token.value);
		}
	});
};

// get output status through OpenMotics webservice API
OpenMoticsPlatform.prototype.heartbeatOutputs = function(beat) {
	return this.request('get_output_status', {})
		.then(
			function(response) {
				if (response.success) {
					let outputStatus = response.status; // status: [{"status": 0, "dimmer": 100, "ctimer": 21600, "id": <output>},...]
					outputStatus.map(function(omOutput) {
						const output = this.outputs[omOutput.id];
						if (output) {
							output.heartbeat(omOutput);
						}
					}.bind(this));
				}
			}.bind(this),
			function(error) {
				this.log('Error getting output status: ' + error);
			}.bind(this)
		);
};

// get input status through OpenMotics webservice API
OpenMoticsPlatform.prototype.heartbeatInputs = function(beat) {
	return this.request('get_last_inputs', {})
		.then(
			function(response) {
				if (response.success) {
					let inputList = response.inputs; // inputs: [[<input>, <output>], [<input>, <output>]...]
					inputList.map(function(omInput) {
						const input = this.inputs[omInput[0]];
						if (input) {
							input.heartbeat(omInput);
						}
					}.bind(this));
				}
			}.bind(this),
			function(error) {
				this.log('Error getting input status: ' + error);
			}.bind(this)
		);
};

module.exports = OpenMoticsPlatform;