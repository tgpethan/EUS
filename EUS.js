const fs = require("fs"),
	  config = require("../config/config.json"),
	  chalk = require("chalk"),
	  busboy = require("connect-busboy"),
	  randomstring = require("randomstring"),
	  getSize = require("get-folder-size"),
	  diskUsage = require("diskusage-ng"),
	  emoji = require("../misc/emoji_list.json");

// Defines the function of this module
const MODULE_FUNCTION = "handle_requests",

	  // Base path for module folder creation and navigation
	  BASE_PATH = "/EUS";

let eusConfig = {},
	image_json = {},
	d = new Date(),
	startTime,
	endTime,
	useUploadKey = true,
	cacheJSON = "";

// Only ran on startup so using sync functions is fine
// Makes the folder for files of the module
if (!fs.existsSync(__dirname + BASE_PATH)) {
	fs.mkdirSync(__dirname + BASE_PATH);
	console.log(`[EUS] Made EUS module folder`);
}
// Makes the folder for frontend files
if (!fs.existsSync(__dirname + BASE_PATH + "/files")) {
	fs.mkdirSync(__dirname + BASE_PATH + "/files");
	console.log(`[EUS] Made EUS web files folder`);
}
// Makes the folder for images
if (!fs.existsSync(__dirname + BASE_PATH + "/i")) {
	fs.mkdirSync(__dirname + BASE_PATH + "/i");
	console.log(`[EUS] Made EUS images folder`);
}
// Makes the image-type file
if (!fs.existsSync(__dirname + BASE_PATH + "/image-type.json")) {
	// Doesn't exist, create it.
	fs.writeFileSync(`${__dirname}${BASE_PATH}/image-type.json`, '{}');
	console.log("[EUS] Made EUS image-type File!");
	// File has been created, load it.
	image_json = require(`${__dirname}${BASE_PATH}/image-type.json`);
} else {
	// File already exists, load it.
	const ijLoadStartTime = new Date().getTime();
	image_json = require(`${__dirname}${BASE_PATH}/image-type.json`);
	console.log(`[EUS] Loaded image-type file, took ${new Date().getTime() - ijLoadStartTime}ms`);
}

// Makes the config file
if (!fs.existsSync(__dirname + BASE_PATH + "/config.json")) {
	// Config doesn't exist, make it.
	fs.writeFileSync(`${__dirname}${BASE_PATH}/config.json`, '{\n\t"baseURL":"http://example.com/",\n\t"acceptedTypes": [\n\t\t".png",\n\t\t".jpg",\n\t\t".jpeg",\n\t\t".gif"\n\t],\n\t"uploadKey": ""\n}');
	console.log("[EUS] Made EUS config File!");
	console.log("[EUS] Please edit the EUS Config file before restarting.");
	// Config has been made, close framework.
	process.exit(0);
} else {
	eusConfig = require(`${__dirname}${BASE_PATH}/config.json`);
	if (validateConfig(eusConfig)) console.log("[EUS] EUS config passed all checks");
}

// Cache for the file count and space usage, this takes a while to do so it's best to cache the result
let cacheIsReady = false;
async function cacheFilesAndSpace() {
	return new Promise((resolve, reject) => {
		const startCacheTime = new Date().getTime();
		let cachedFilesAndSpace = {
			files: {}
		},

		// Cache file totals
		total = 0;
		// Add each accepted file type to the json
		for (var i2 = 0; i2 < eusConfig.acceptedTypes.length; i2++) {
			cachedFilesAndSpace["files"][`${eusConfig.acceptedTypes[i2]}`.replace(".", "")] = 0;
		}
		// Read all files from the images directory
		fs.readdir(__dirname + BASE_PATH + "/i", async (err, files) => {
			if (err) reject(err);
			else {
				// Loop through all files
				for (var i = 0; i < files.length; i++) {
					// Loop through all accepted file types to check for a match
					for (var i1 = 0; i1 < eusConfig.acceptedTypes.length; i1++) {
						const readFileName = files[i].split(".");
						if (`.${readFileName[readFileName.length-1]}` == eusConfig.acceptedTypes[i1]) {
							// There is a match! Add it to the json
							cachedFilesAndSpace["files"][eusConfig.acceptedTypes[i1].replace(".", "")]++;
							// Also increase the total
							total++;
						}
					}
				}
				// Set the total in the json to the calculated total value
				cachedFilesAndSpace["files"]["total"] = total;

				// Cache usage
				cachedFilesAndSpace["space"] = {
					usage: {}
				};
				// Get the space used on the disk
				getSize(__dirname + BASE_PATH + "/i", async (err, size) => {
					if (err) reject(err);
					else {
						// Calculate in different units the space taken up on disk
						let sizeOfFolder = (size / 2048);
						cachedFilesAndSpace["space"]["usage"]["mb"] = sizeOfFolder;
						sizeOfFolder = (size / 3072);
						cachedFilesAndSpace["space"]["usage"]["gb"] = sizeOfFolder;
						cachedFilesAndSpace["space"]["usage"]["string"] = await spaceToLowest(size, true);
						// Get total disk space
						diskUsage(__dirname, async (err, data) => {
							if (err) reject(err);
							else {
								cachedFilesAndSpace["space"]["total"] = {
									value: await spaceToLowest(data["total"], false),
									mbvalue: (data["total"] / 2048),
									gbvalue: (data["total"] / 3072),
									stringValue: (await spaceToLowest(data["total"], true)).split(" ")[1].toLowerCase(),
									string: await spaceToLowest(data["total"], true)
								};

								resolve(cachedFilesAndSpace);
								global.modules.consoleHelper.printInfo(emoji.folder, `Stats api cache took ${new Date().getTime() - startCacheTime}ms`);
							}
						});
					}
				});
			}
		});
	});
}

function validateConfig(json) {
	let performShutdownAfterValidation = false;
	// URL Tests
	if (json["baseURL"] == null) {
		console.error("EUS baseURL property does not exist!");
		performShutdownAfterValidation = true;
	} else {
		if (json["baseURL"] == "") console.warn("EUS baseURL property is blank");
		const bURL = `${json["baseURL"]}`.split("");
		if (bURL.length > 1) { 
			if (bURL[bURL.length-1] != "/") console.warn("EUS baseURL property doesn't have a / at the end, this can lead to unpredictable results!");
		}
		else {
			if (json["baseURL"] != "http://" || json["baseURL"] != "https://") console.warn("EUS baseURL property is possibly invalid!");
		}
	}
	// acceptedTypes checks
	if (json["acceptedTypes"] == null) {
		console.error("EUS acceptedTypes array does not exist!");
		performShutdownAfterValidation = true;
	} else {
		if (json["acceptedTypes"].length < 1) console.warn("EUS acceptedTypes array has no extentions in it, users will not be able to upload images!");
	}
	// uploadKey checks
	if (json["uploadKey"] == null) {
		console.error("EUS uploadKey property does not exist!");
		performShutdownAfterValidation = true;
	} else {
		if (json["uploadKey"] == "") useUploadKey = false;
	}

	// Check if server needs to be shutdown
	if (performShutdownAfterValidation) {
		console.error("EUS config properties are missing, refer to docs for more details (https://docs.ethanus.ml)");
		process.exit(1);
	}
	else return true;
}

function cleanURL(url = "") {
	return url.split("%20").join(" ").split("%22").join("\"").split("%23").join("#").split("%24").join("$").split("%25").join("%").split("%26").join("&").split("%27").join("'").split("%2B").join("+").split("%2C").join(",").split("%2F").join("/")
			  .split("%3A").join(":").split("%3B").join(";").split("%3C").join("<").split("%3D").join("=").split("%3E").join(">").split("%3F").join("?")
			  .split("%40").join("@")
			  .split("%5B").join("[").split("%5C").join("\\").split("%5D").join("]").split("%5E").join("^")
	   		  .split("%60").join("`")
	   		  .split("%7B").join("{").split("%7C").join("|").split("%7D").join("}").split("%7E").join("~");
}

module.exports = {
	extras:async function() {
		// Setup express to use busboy
		global.app.use(busboy());
		cacheJSON = JSON.stringify(await cacheFilesAndSpace());
		cacheIsReady = true;
	},
	get:async function(req, res) {
		/*
			req - Request from client
			res - Response from server
		*/
		
		// Set some headers
		res.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
		res.set("X-XSS-Protection", "1; mode=block");
		res.set("Feature-Policy", "fullscreen 'none'");
		res.set("Permissions-Policy", "microphone=(), geolocation=(), magnetometer=(), camera=(), payment=(), usb=(), accelerometer=(), gyroscope=()");
		res.set("Referrer-Policy", "strict-origin-when-cross-origin");
		res.set("Content-Security-Policy", "block-all-mixed-content;frame-ancestors 'self'");
		res.set("X-Frame-Options", "SAMEORIGIN");
		res.set("X-Content-Type-Options", "nosniff");

		req.url = cleanURL(req.url);

		// Check if returned value is true.
		if (req.url.includes("/api/")) return handleAPI(req, res);

		// Register the time at the start of the request
		d = new Date();
		startTime = d.getTime();

		// Get the requested image
		let urs = `${req.url}`; urs = urs.split("/")[1];
		// Get the file type of the image from image_json and make sure it exists
		fs.access(`${__dirname}${BASE_PATH}/i/${urs}${image_json[urs]}`, (error) => {
			if (error) {
				// Doesn't exist, handle request normaly
				if (req.url === "/") { urs = "/index.html" } else { urs = req.url }
				fs.access(`${__dirname}${BASE_PATH}/files${urs}`, (error) => {
					if (error) {
						// Doesn't exist, send a 404 to the client.
						res.status(404).send("404!<hr>EUS");
						d = new Date();
						endTime = d.getTime();
						global.modules.consoleHelper.printInfo(emoji.cross, `${req.method}: ${chalk.red("[404]")} ${req.url} ${endTime - startTime}ms`);
					} else {
						// File does exist, send it back to the client.
						res.sendFile(__dirname + BASE_PATH + "/files"+req.url);
						d = new Date();
						endTime = d.getTime();
						global.modules.consoleHelper.printInfo(emoji.heavy_check, `${req.method}: ${chalk.green("[200]")} ${req.url} ${endTime - startTime}ms`);
					}
				});
			} else {
				// Image does exist, send it back.
				res.sendFile(`${__dirname}${BASE_PATH}/i/${urs}${image_json[urs]}`);
				d = new Date();
				endTime = d.getTime();
				global.modules.consoleHelper.printInfo(emoji.heavy_check, `${req.method}: ${chalk.green("[200]")} ${req.url} ${endTime - startTime}ms`);
			}
		});
	},
	post:async function(req, res) {
		/*
			req - Request from client
			res - Response from server
		*/

		// Make sure the endpoint is /upload
		// If it isn't upload send an empty response
		if (req.url != "/upload") return res.end("");

		// Get time at the start of upload

		if (useUploadKey && eusConfig["uploadKey"] != req.header("key")) return res.end("Incorrect key provided for upload");

		d = new Date(); startTime = d.getTime();
		var fstream;
		var thefe;
		// Pipe the request to busboy
		req.pipe(req.busboy);
		req.busboy.on('file', function (fieldname, file, filename) {
			// Get the image-type json
			image_json = require(`${__dirname}${BASE_PATH}/image-type.json`);
			// Make a new file name
			fileOutName = randomstring.generate(14);
			global.modules.consoleHelper.printInfo(emoji.fast_up, `${req.method}: Upload of ${fileOutName} started.`);
			// Check the file is within the accepted file types  
			if (eusConfig.acceptedTypes.includes(`.${filename.split(".")[filename.split(".").length-1]}`)) {
				// File is accepted, set the extention of the file in thefe for later use.
				thefe = `.${filename.split(".")[filename.split(".").length-1]}`;
			} else {
				// File isn't accepted, send response back to client stating so.
				res.status(403).end("This file type isn't accepted currently.");
				return;
			}
			// Create a write stream for the file
			fstream = fs.createWriteStream(__dirname + BASE_PATH + "/i/" + fileOutName + thefe);
			file.pipe(fstream);
			fstream.on('close', function () {
				// Get the time at the end of the upload
				d = new Date(); endTime = d.getTime();
				// Add image file type to the image_json array
				image_json[fileOutName] = `.${filename.split(".")[filename.split(".").length-1]}`;
				// Save image_json array to the file
				fs.writeFile(`${__dirname}${BASE_PATH}/image-type.json`, JSON.stringify(image_json), async (err) => {
					if (err) reject(err);
					else {
						global.modules.consoleHelper.printInfo(emoji.heavy_check, `${req.method}: Upload of ${fileOutName} finished. Took ${endTime - startTime}ms`);
						// Send URL of the uploaded image to the client           
						res.end(eusConfig.baseURL+""+fileOutName);

						// Update cached files & space
						cacheJSON = JSON.stringify(await cacheFilesAndSpace());
					}
				});
			});
		});
	}
}

async function handleAPI(req, res) {
	d = new Date(); startTime = d.getTime();
	let jsonaa = {}, filesaa = 0, spaceaa = 0;
	switch (req.url.split("?")[0]) {
		// Status check to see the onlint status of EUS
		// Used by ESL to make sure EUS is online
		case "/api/get-server-status":
			d = new Date(); endTime = d.getTime();
			global.modules.consoleHelper.printInfo(emoji.heavy_check, `${req.method}: ${chalk.green("[200]")} ${req.url} ${endTime - startTime}ms`);
			return res.end('{ "status":1, "version":"'+global.internals.version+'" }');
		
		/*  Stats api endpoint
			Query inputs
			  f : Values [0,1]
			  s : Values [0,1]
		*/
		case "/api/get-stats":
			filesaa = req.query["f"];
			spaceaa = req.query["s"];
			if (!cacheIsReady) return res.end("Cache is not ready");
			jsonaa = JSON.parse(cacheJSON);
			// If total files is asked for
			if (filesaa == 1) {
				// If getting the space used on the server isn't required send the json
				if (spaceaa != 1) {
					d = new Date(); endTime = d.getTime();
					global.modules.consoleHelper.printInfo(emoji.heavy_check, `${req.method}: ${chalk.green("[200]")} ${req.url} ${endTime - startTime}ms`);
					delete jsonaa["space"];
					return res.end(JSON.stringify(jsonaa));
				}
			}
			// Getting space is required
			if (spaceaa == 1) {
				d = new Date(); endTime = d.getTime();
				global.modules.consoleHelper.printInfo(emoji.heavy_check, `${req.method}: ${chalk.green("[200]")} ${req.url} ${endTime - startTime}ms`);
				if (filesaa != 1) delete jsonaa["files"];
				return res.end(JSON.stringify(jsonaa));
			}

			if (filesaa != 1 && spaceaa != 1) {
				d = new Date(); endTime = d.getTime();
				global.modules.consoleHelper.printInfo(emoji.heavy_check, `${req.method}: ${chalk.green("[200]")} ${req.url} ${endTime - startTime}ms`);
				return res.end("Please add f and or s to your queries to get the files and space");
			}
		break;

		// Information API
		case "/api/get-info":
			d = new Date(); endTime = d.getTime();
			global.modules.consoleHelper.printInfo(emoji.heavy_check, `${req.method}: ${chalk.green("[200]")} ${req.url} ${endTime - startTime}ms`);
			return res.end(JSON.stringify({
				version: global.internals.version,
				instance: config["server"]["instance_type"]
			}));

		default:
			d = new Date(); endTime = d.getTime();
			global.modules.consoleHelper.printInfo(emoji.heavy_check, `${req.method}: ${chalk.green("[200]")} ${req.url} ${endTime - startTime}ms`);
			return res.send(`
				<h2>All currently avaliable api endpoints</h2>
				<a href="/api/get-server-status">/api/get-server-status</a>
				<a href="/api/get-stats">/api/get-stats</a>
				<a href="/api/get-info">/api/get-info</a>
			`);
	}
}

const spaceValues = ["B", "KB", "MB", "GB", "TB", "PB", "EB"]; // Futureproofing:tm:

async function spaceToLowest(spaceValue, includeStringValue) {
	return new Promise((resolve, reject) => {
		// Converts space values to lower values e.g MB, GB, TB etc depending on the size of the number
		let i1 = 1;
		// Loop through until value is at it's lowest
		for (let i = 0; i < i1; i++) {
			if (spaceValue >= 1024) {
				spaceValue = spaceValue / 1024;
			}

			if (spaceValue >= 1024) i1++;
		}

		if (includeStringValue) resolve(`${spaceValue.toFixed(2)} ${spaceValues[i1]}`);
		else resolve(spaceValue);
	});
}

module.exports.MOD_FUNC = MODULE_FUNCTION;