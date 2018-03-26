# homebridge-openmotics
A homebridge plugin for OpenMotics

All OpenMotics Inputs and Outputs become available in Homekit and can be configured and used in rules and scenes.

## Example config.json
{
 "platforms": [

    {
      "platform": "OpenMotics",
      "name": "OpenMotics Gateway",
      "manufacturer": "OpenMotics",
      "model": "OMHGM_3_1 Gateway V2",
      "serialNumber": "AA:BB:CC:DD:EE:FF",
      "hostname": "openmotics",
      "username": "username",
      "password": "password",
      "inputQueueDelay": 10000,
      "heartbeatDelay": 500,
      "outputs": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
      "inputs": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]
    }
  ]
}

### hostname
DNS name or IP address of OpenMotics Gateway

### username/password
A username and password with access to the OpenMotics Gateway

### inputQueueDelay
Duration in ms pressed inputs remain in get_last_inputs (http://wiki.openmotics.com/index.php/Gateway_Module_Webservice_API#WebInterface.get_last_inputs.28token.29)

### heartbeatDelay
Duration in ms between polls of the OpenMotics Gateway web service

### outputs
Array with id's of OpenMotics Outputs available for Homekit

### inputs
Array with id's of OpenMotics Inputs available for Homekit
