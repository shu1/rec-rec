// Shuichi Aizawa 2018
"use strict";

document.title = "rec-rec"

var meta = document.createElement('meta');
meta.name = "viewport";
meta.content = "user-scalable=no,width=960";
document.head.appendChild(meta);

var style = document.body.style;
style.background = "#000";
style.width = 960;
style.marginLeft = "auto";
style.marginRight = "auto";

c.width = 960;
c.height = 540;
c.style.background = "linear-gradient(#00f,#f04)";

var context2d = c.getContext("2d");
context2d.fillRect(0, 0, c.width, 64);
context2d.font = "12px sans-serif";

var p = document.createElement("p");
p.style.color = "#ddd";
p.innerHTML = `Make a rap with loops! Talk into your <b>mic</b> to make the loops.<br>
Tap anywhere on the canvas to <b>start</b>. The water surface shows the audio waveform, the bubbles show each track's spectrogram.<br>
Tap on any of the 4 <b>fish</b>, it will turn <span style="color:#fa0">orange</span> when selected. On the next loop, a <span style="color:#fff">white</span> waveform will appear from the sound of the mic, and the fish will eat the sound. From the next loop, the fish will play back the sound.<br>
Tap the area above the water (at the top of the canvas) to <b>stop</b> at the end of the loop. Double-tap to change track visualization.<br>
<br>
<b>Microphone</b> required for recording.<br>
Due to lack of support for the MediaRecorder API, <b>recording will not work on iOS/Safari/Edge</b>. It works on Android/Chrome/Firefox.`;
document.body.appendChild(p);

var lag, mode, stop, playing, recording, recIndex, generated, gainNode, gAnalyser, gStream, playTime, fpsCount=0, fpsTime=0, fpsText="";
var audioContext, recorder, tracks=[];
var styles = ["#fff","#f0f","#ff0","#0ff","#0f0","#fa0"];
var fishHeight = (c.height-64)/4;
var data128 = new Uint8Array(128);
var data1024 = new Uint8Array(1024);

navigator.mediaDevices.getUserMedia({audio:true})
.then(function(stream) {
	gStream = stream;
	recorder = new MediaRecorder(stream);
	recorder.ondataavailable = function(e) {
		tracks[recIndex].au.src = URL.createObjectURL(e.data);
		lag = audioContext.currentTime - playTime;
		tracks[recIndex].au.currentTime = 0.1 + lag + tracks[recIndex].of;
		tracks[recIndex].au.play();
		recIndex = 0;
	}
})

for (var i=0; i<6; ++i) {
	tracks[i] = {};
	tracks[i].of = 0;
	if (i > 0) tracks[i].au = new Audio();
}

var player = new CPlayer();
player.init(song);
var generator = setInterval(function() {
	if (generated = player.generate() >= 1) {
		clearInterval(generator);
	}
},0);

c.onmousedown = function(e) {
	if (audioContext) {
		var i = Math.ceil(((e.touches ? e.touches[0].pageY : e.pageY) - c.offsetTop - 64) / fishHeight);
		if (i && playing) {
			if (!recording) {
				if (recIndex != i) {
					recIndex = i;
				} else {
					recIndex = 0;
				}
			}
		} else {
			if (stop) {
				stop = 0;
				mode = !mode;
			}
			else if (playing) {
				stop = 1;
			}
			else {
				playTime = audioContext.currentTime;
				play();
			}
		}
	}
	else if (gStream && generated) {
		audioContext = new (window.AudioContext || window.webkitAudioContext)();
		gAnalyser = audioContext.createAnalyser();
		gAnalyser.connect(audioContext.destination);
		gainNode = audioContext.createGain();
		gainNode.connect(gAnalyser);

		for (var i=0; i<6; ++i) {
			tracks[i].an = audioContext.createAnalyser();
			tracks[i].an.fftSize = data128.length * 2;
			if (i < 5) {
				tracks[i].an.connect(gainNode);
			}
				
			if (i == 5) {
				var source = audioContext.createMediaStreamSource(gStream);
				source.connect(tracks[i].an);
			}
			else if (i) {
				var source = audioContext.createMediaElementSource(tracks[i].au);
				source.connect(tracks[i].an);
			}
		}

		var wave = player.createWave();
		audioContext.decodeAudioData(wave.buffer, function(buffer) {
			tracks[0].bu = buffer;
			playTime = audioContext.currentTime;
			play();
			draw(0);
		});
	}
}

function play() {
	stop = 0;
	playing = 1;
	for (var i=0; i<5; ++i) {
		if (tracks[i].bu) {
			playBuffer(i);
		}
		else if (tracks[i].au.src) {
			var dt = audioContext.currentTime - playTime;
			tracks[i].au.currentTime = dt + 0.1;
			tracks[i].au.play();
		}
	}
	lag = 0;
}

function playBuffer(i) {
	var source = audioContext.createBufferSource();
	source.buffer = tracks[i].bu;
	source.connect(tracks[i].an);
	source.start(0);

	if (!i) {
		source.onended = function() {
			if (stop) {
				stop = 0;
				playing = 0;
			} else {
				playTime = audioContext.currentTime;
				if (recorder && recIndex) {
					if (recording) {
						recorder.stop();
						recording = 0;
						gainNode.gain.setValueAtTime(1, audioContext.currentTime);
						lag = audioContext.currentTime - playTime;
						tracks[recIndex].of += lag;
					} else {
						gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
						recorder.start();
						recording = 1;
						tracks[recIndex].of = lag = audioContext.currentTime - playTime;
					}
				}
				play();
			}
		}
	}
}

function draw(time) {
	context2d.clearRect(0, 0, c.width, c.height);

	var dWidth = c.width / data128.length
	context2d.lineWidth = 1;
	for (var i=0; i<5; ++i) {
		if (!i || tracks[i].au.src) {
			tracks[i].an.getByteFrequencyData(data128);

			if (mode) {
				for (var j = data128.length-1; j >= 0; --j) {
					var h = data128[j]/-255 * c.height;
					var gradient = context2d.createLinearGradient(0, c.height, 0, c.height + h);
					gradient.addColorStop(0, "rgba(0,0,0,0)");
					gradient.addColorStop(1, stop ? "#000" : styles[i]);
					context2d.fillStyle = gradient;
					context2d.fillRect((j + i/5) * dWidth, c.height, 1, h);
				}
			} else {
				context2d.strokeStyle = stop ? "#000" : styles[i];
				context2d.beginPath();
				for (var j = data128.length/2; j >= 0; --j) {
					var y = 541 - data128[j]*2;
					context2d.moveTo((j+1)*15, y);
					context2d.lineTo(j*15, y);
				}
				context2d.stroke();
			}
		}
	}

	var offset = (data1024.length - c.width)/2
	gAnalyser.getByteTimeDomainData(data1024);
	context2d.fillStyle = "#000";
	context2d.beginPath();
	context2d.moveTo(c.width, 0);
	for (var i = c.width; i >= 0; --i) {
		context2d.lineTo(i, data1024[i + offset]/2);
	}
	context2d.lineTo(0,0);
	context2d.fill();

	var x = ((playTime - audioContext.currentTime) / tracks[0].bu.duration + 1) * c.width;
	var r = 64;
	context2d.lineWidth = 2;
	context2d.strokeStyle = "#fff";
	context2d.beginPath();
	for (var i=1; i<5; ++i) {
		var y = fishHeight * (i-0.5) + 64;

		if (recording && i == recIndex) {
			tracks[5].an.getByteTimeDomainData(data128);
			context2d.moveTo(x+r, y);
			var dx = (x+r) / data128.length;
			for (var j = data128.length-1; j >= 0; --j) {
				context2d.lineTo(dx*j, y + (data128[j]-128)/2);
			}
		}
		else if (tracks[i].au.src) {
			tracks[i].an.getByteTimeDomainData(data128);
			context2d.moveTo(x+r, y);
			for (var j = data128.length-1; j >= 0; --j) {
				context2d.lineTo(x-r+j, y + (data128[j]-128)/4);
			}
		}
	}
	context2d.stroke();

	var theta = (audioContext.currentTime - playTime) % (tracks[0].bu.duration/4);
	var sin = Math.sin(theta * 2*Math.PI);
	var rx = r+16;
	var ry = r+16 + sin*4;
	var my = 8;
	var ex = x-56;
	var fx = x-48;
	var tx = x + rx;
	for (var i=1; i<5; ++i) {
		var y = fishHeight * (i-0.5) + 64;
		var gradient = context2d.createRadialGradient(x-32, y, 0, x, y, rx + sin*4);
		gradient.addColorStop(0, "rgba(255,255,255,0)");
		gradient.addColorStop(1, i == recIndex ? styles[5] : styles[i]);
		context2d.fillStyle = gradient;
		context2d.beginPath();
		context2d.moveTo(x-r, y);
		context2d.lineTo(x-rx, y-my);
		context2d.quadraticCurveTo(x, y-ry, x+rx, y);
		context2d.quadraticCurveTo(x, y+ry, x-rx, y+my);
		context2d.fill();

		var ey = y-16 - sin;
		gradient = context2d.createRadialGradient(ex, ey, 0, ex, ey, 16);
		gradient.addColorStop(0, "rgba(255,255,255,0)");
		gradient.addColorStop(1, "rgba(255,255,255,1)");
		context2d.fillStyle = gradient;
		context2d.beginPath();
		context2d.ellipse(ex, ey, 8, 12, 0, 0, 2*Math.PI);
		context2d.fill();

		var fy = y-32 - sin*2;
		gradient = context2d.createRadialGradient(fx+32, fy - sin*4, 0, fx+32, fy - sin*4, 32);
		gradient.addColorStop(0, "rgba(255,255,191,0)");
		gradient.addColorStop(1, "rgba(255,255,191,1)");
		context2d.fillStyle = gradient;
		context2d.beginPath();
		context2d.moveTo(fx, fy);
		context2d.quadraticCurveTo(fx+32, fy-32 - sin*8, fx+64, fy-16 - sin*8);
		context2d.fill();

		drawTail(0);
		drawTail(1/3);
		drawTail(2/3);
	}

	function drawTail(i) {
		var sin = Math.sin((theta+i) * 2*Math.PI);
		gradient = context2d.createRadialGradient(tx+16, y - sin*8, 0, tx+16, y - sin*8, 48);
		gradient.addColorStop(0, "rgba(191,255,255,0)");
		gradient.addColorStop(1, "rgba(191,255,255,1)");
		context2d.fillStyle = gradient;
		context2d.beginPath();
		context2d.moveTo(tx, y);
		context2d.quadraticCurveTo(tx+40, y-16 - sin*16, tx+48, y - sin*16);
		context2d.quadraticCurveTo(tx+40, y+16 - sin*16, tx, y);
		context2d.fill();
	}

	fpsCount++;
	if (time - fpsTime > 984) {
		fpsText = fpsCount + "fps";
		fpsTime = time;
		fpsCount = 0;
	}
	context2d.fillStyle = "#fff";
	context2d.fillText(fpsText + (stop ? " stop" : ""), 1, 12);

	requestAnimationFrame(draw);
}
