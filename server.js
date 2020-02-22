// Andrew Donegan, 15315962

// Initial Setup: 'npm install' which gets npm dependencies.
// Run: 'node server.js' 

/*------------ Some code sourced from: 

      https://stackoverflow.com/questions/8165570/https-proxy-server-in-node-js
      
      https://nodejs.org/en/docs/guides/anatomy-of-an-http-transaction/

------------*/ 

/*********************

  For HTTPS blocking, the web browser will just say: "This site can’t be reached" instead of displaying text from my proxy

*********************/

const http = require('http'), // Import libraries
      url = require('url'),
      net = require('net'), // For socket for https
      fs = require('fs'); // File system to read in blacklist file
      fileName = './blacklist.json';
      readline = require('readline'); // To read in blacklist input

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});
      
      
const hostname = '127.0.0.1';
const port = 3000;
var blacklistFile = JSON.parse(fs.readFileSync(fileName)); // Read in the json file with the blacklisted sites
try {
  var cache = JSON.parse(fs.readFileSync("cache.JSON")); // Copy of cache in function scope
  } catch(err){
    console.log("Cache.json is invalid, enter '{}' into the file to reset it");
  }
var blacklist= blacklistFile.blacklist;


const server = http.createServer((browser_req, browser_res) => {

  proxy_url = url.parse(browser_req.url,true);
  console.log("Proxying HTTP request for:",proxy_url.host);
  
  for(i in blacklist){ // Check if the site is blacklisted
    if(blacklist[i]===proxy_url.host){
      browser_res.writeHead(403); // Pass the forbidden status header
      return browser_res.end("This site is blacklisted");
    }
  }

  //Served cached data if available
	cache = JSON.parse(fs.readFileSync("cache.json"));
	if(inCache(browser_req.url)){
  		console.log("Serving cached data for "+browser_req.url);
  		var chunks = JSON.stringify(cache[browser_req.url].data); // Get data from cache corresponding to url
  		buffer = new Buffer(JSON.parse(chunks)); // Buffer for data chunk
  		cache[browser_req.url].header['content-length'] = buffer.length; // Number in header to indicate length
  		cache[browser_req.url].header['accept-encoding'] = browser_req.headers['accept-encoding']; // What the same encoding
  		browser_res.writeHead(cache[browser_req.url].status,cache[browser_req.url].header); // Write status and header data into header
  		browser_res.write(buffer); // Pass data from buffer to response
  		return browser_res.end();
	}

  var dataToCache=[]; // Array for data to be cached
  
  // Create the proxy request
  var proxy_req = http.request({
    port: 80,
    host: proxy_url.host,
    method: browser_req.headers['method'], // Set status headers before writing data to body
    path: proxy_url.path
  });
  proxy_req.end();
  proxy_req.on('error',console.log); // Log any errors on the proxy request stream

  proxy_req.on('response', function(proxy_res){ // Handler for the proxy response

    proxy_res.on('data', function(chunk){ // Send data to body required onto the response to the browser response
      dataToCache.push(chunk);
      browser_res.write(chunk,'binary');  
    });

    proxy_res.on('end', function(){ // When the proxy connection is finished, send the browser response
      cacheData(browser_req.url,proxy_res.headers,dataToCache,proxy_res.statusCode);
      browser_res.end();
    });

    browser_res.writeHead(proxy_res.statusCode, proxy_res.headers); // Write the headers to the response
  });

});
server.listen(port, hostname ,() => {
  console.log(`Server running at ${hostname}:${port}`);
  console.log('Available commands: Include "www." when passing in domain\n "blacklist" <domain> to block given domain\n "blacklist" to view list of blocked sites\n'+
  ' "remove" <domain> to remove domain from blacklist\n "clear" to clear cache\n\n');
});


// HTTPS Socket --------------------------------------------------

// Browser connection request listener for https
server.addListener('connect', function (browser_req, browser_socket, bodyhead) {
  // Since this is secure we cannot access the information so my proxy simply passes on the information to be displayed
  
  // The browser request url contains the information on what needs to be displayed on the browser
  // This split allows me to connect the socket to the correct domain and port using the information from the browser request url
  var port = browser_req.url.split(':')[1]; 
  var hostDomain = browser_req.url.split(':')[0]; 
  for( i in blacklist){
    if(blacklist[i]===hostDomain){
      browser_socket.write("HTTP/" + browser_req.httpVersion + " 403 Forbidden\r\n\r\n"); // Pass the forbidden status to the request
      return browser_socket.end("This site is blacklisted"); // NOT GETTING DISPLAYED
    }
  }

  console.log("Proxying HTTPS request for:", hostDomain,"on port:", port);

  var proxy_socket = new net.Socket();
  proxy_socket.connect(port, hostDomain, function () { // Create connection between server and proxy socket
    proxy_socket.write(bodyhead);
    browser_socket.write("HTTP/" + browser_req.httpVersion + " 200 Connection established\r\n\r\n");
  });

  proxy_socket.on('data', function (chunk) { 
    browser_socket.write(chunk); // When passed data write it to the browser socket, we don't try save to cache as we cannot see the body of the data
  });

  proxy_socket.on('end', function () { // Proxy socket is finished so end browser socket
    browser_socket.end();
  });

  proxy_socket.on('error', function () {
    browser_socket.write("HTTP/" + browser_req.httpVersion + " 500 Connection error\r\n\r\n");
    browser_socket.end();
  });

  browser_socket.on('data', function (chunk) { // Pass browser data to proxy
    proxy_socket.write(chunk);
  });

  browser_socket.on('end' || 'error', function () { // Browser socket is finished or error occurs so end proxy socket
    proxy_socket.end();
  });

});

rl.question('', (answer) => { // To dynamically edit blacklist using passed commands

  var input = answer.split(' '); // Split up command inputs

  switch (input[0]){ // To find what function to call
    case "blacklist": 
      if (input.length>1){
        blacklistAdd(input); 
      }else{
        console.log("Current blacklist:\n"+ blacklist);
      }
      break;
    case "remove":
      blacklistRemove(input);
      break;
    case "clear":
      clearCache();
      break;
  }

  rl.close();
});

//---------------------------  Blacklist

function blacklistAdd(input){ // Add site to blacklist
  var inList = false;
  for (i in blacklist){
    if(input[1]===blacklist[i]){
      inList=true;
    }
  }
  if(!inList){
    blacklist.push(input[1]);
    console.log(input[1]," has been added to blacklist");
  }

  var blist = JSON.parse(fs.readFileSync("blacklist.JSON")); // Local copy of file 
  blist.blacklist=blacklist; // Update JSON's file blacklist

  fs.writeFile(fileName, JSON.stringify(blist), function (err) {
    if (err) throw err;
  });
}

function blacklistRemove(input){ // Remove site from blacklist
  for(var j=1;j<input.length;j++){
    for (i in blacklist){
      if(input[j]===blacklist[i]){
        blacklist.splice(i,1);
        console.log(input[j]," has been removed from blacklist");
      }
    }
  }

  var blist = JSON.parse(fs.readFileSync("blacklist.JSON")); // Local copy of file 
  blist.blacklist=blacklist; // Update JSON's file blacklist
  fs.writeFile(fileName, JSON.stringify(blist), function (err) { // Update JSON file
    if (err) throw err; 
  });
}

//------------------------------------- Cache

fs.watchFile("cache.json",function(){
	updateCache();
});
function updateCache(){
  	cache = JSON.parse(fs.readFileSync("cache.json"));
  	//cachedUrls = cache.urls;
}
//Checks if a url is cached
function inCache(url){
	try {
    var cache = JSON.parse(fs.readFileSync("cache.JSON")); // Copy of cache in function scope
    } catch(err){
      console.log("Cache.json is invalid, enter '{}' into the file to reset it");
  }
	if(cache[url]){
		return true;
	}
	else{
		return false;
	}
}

function cacheData(url,header,data,status){ // Stores header and data in cache

  if(header['cache-control']){ // Check the header to see cache status
		for(i in header['cache-control'].split(',')){
			if(header['cache-control'].split(',')[i].search('no-cache')!=-1){
				return;
			}
		}
  }
  
  try {
  var cache = JSON.parse(fs.readFileSync("cache.JSON")); // Copy of cache in function scope
  } catch(err){
    console.log("Cache.json is invalid, enter '{}' into the file to reset it");
  }
  cache[url] = {"header":header,"status":status,"data":data.toString()}; // Format to save url data into cache file

  var cacheString = JSON.stringify(cache); 
  if(IsJsonString(cacheString)){
    var stream = fs.createWriteStream("cache.JSON");
    stream.write(cacheString); // Write data to JSON file
    console.log("Caching data from: ", url);
  }else{
    console.log("Cannot cache invalid JSON.");
  }
}

// To test if valid JSON - From: https://stackoverflow.com/questions/3710204/how-to-check-if-a-string-is-a-valid-json-string-in-javascript-without-using-try
function IsJsonString(str) { 
  try {
      JSON.parse(str); // I need to check that this is valid or else there is no point in saving the data in the cache as it will be invalid
  } catch (e) {
      return false;
  }
  return true;
}

function clearCache(){
  fs.writeFile('cache.json','{}',function(err){
    if(err){
      throw err;
    }else{
      console.log("Cache is cleared")
    }
  });
}