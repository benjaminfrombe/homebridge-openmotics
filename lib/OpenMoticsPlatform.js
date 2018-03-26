'use strict';

const https = require('https');
const OpenMoticsGateway = require('./OpenMoticsGateway');
const OpenMoticsOutput = require('./OpenMoticsOutput');
const OpenMoticsInput = require('./OpenMoticsInput');


function OpenMoticsPlatform(log, config, api) {
	this.log = log;
	this.config = config;

	// initialize token for gateway API
	this.token = {'value': false, 'expires': Date.now(), 'asked': false};

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

	// initialize previous inputs to keep track of input presses
	this.previousInputState = { 'inputs': [], 'heartbeat': 0 };
	this.inputQueueDelay = this.config.inputQueueDelay || 10000; // by default, input values stay in the queue for 10s=10000ms

	this.heartbeatDelay = this.config.heartbeatDelay || 1000;

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
	        beat %= 24 * 60 * 60; // reset after 1 day

	        this.heartbeatOutputs(beat);
	        this.heartbeatInputs(beat);
	      }.bind(this), this.heartbeatDelay);
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
				this.log('No need to request a new token, we are still waiting');
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
					let newInputList = response.inputs.map(function(input) {
						// inputs: [[<input>, <output>], [<input>, <output>]...]
						// don't care about the output linked in OpenMotics
						return input[0];
					}, this);

					if (newInputList.length > 0) {

						let inputList = newInputList;

						// filter out any previous input presses if necessary
						if ( (this.previousInputState.inputs.length > 0) && (this.previousInputState.heartbeat + this.inputQueueDelay) > beat) {
							// OpenMotics keeps the last 5 inputs in an array for 10s
							// remove previous inputs from new inputs, so we don's take the same action more than once
							let overlap = arrayOverlap(newInputList, this.previousInputState.inputs);
							inputList = newInputList.slice(overlap.length);
						}

						inputList.map(function(input) {
							const omInput = this.inputs[input];
							if (omInput) {
								omInput.heartbeat(input);
							}
						}, this);
					}

					// save the Input State for next time
					this.previousInputState.inputs = newInputList;
					this.previousInputState.heartbeat = beat;
				}
			}.bind(this),
			function(error) {
				this.log('Error getting input status: ' + error);
			}.bind(this)
		);
};

// arrayOverlap of 2 arrays will get as many elements as match the front of array1 and the rear of array2
// e.g. array1 =       [3, 4, 5, 6, 7]
//      array2 = [1, 2, 3, 4, 5]
// would return  [3, 4, 5]
function arrayOverlap(array1, array2) {

	if (array1.length == 0 || array2.length == 0) {
		return [];
	}

	var overlap = array1.slice(0, array2.length).reduce(function(overlap, element, index) {
		if (element == array2[index]) {
			overlap.push(element);
		}
		return overlap;
	}, []);
	if (overlap.length > 0) {
		if (array2.length == overlap.length) {
			return overlap;
		}
		else {
			return arrayOverlap(array1, array2.slice(overlap.length));
		}
	}
	else {
		return arrayOverlap(array1, array2.slice(1));
	}
}

module.exports = OpenMoticsPlatform;