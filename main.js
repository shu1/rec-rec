// Shuichi Aizawa 2018 github.com/shu1
"use strict";

document.title = "rec-rec"

var meta = document.createElement("meta");
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

var a = c.getContext("2d");	// png remove
a.fillRect(0, 0, c.width, 64);
a.font = "12px sans-serif";

var p = document.createElement("p");
p.style.color = "#ddd";
p.innerHTML = `Make a rap with loops! Tap anywhere on the canvas to <b>start</b>.<br>
Tap on any of the 4 <b>fish</b>, it will turn <span style="color:#fa0">orange</span> when selected. On the next loop, a <span style="color:#fff">white</span> waveform will appear from the sound of the mic. Talk into your <b>mic</b> and the fish will eat the sound. From the next loop, the fish will play back the sound.<br>
Tap the area above the water (at the top of the canvas) to <b>stop</b> at the end of the loop, the visualizer will turn <span style="color:#777">black</span>. Tap again to change visualizers.<br>
<br>
<b>Microphone</b> required for recording.<br>
Due to lack of support for the MediaRecorder API, <b>recording will not work on iOS/Safari/Edge</b>. It works on Android/Chrome/Firefox.`;	// png make one line
document.body.appendChild(p);

var mode, stop, playing, recording, recIndex, generated, gainNode, gAnalyser, gStream, playTime, fpsCount=0, fpsTime=0, fpsText="";
var audioContext, recorder, tracks=[];
var styles = ["#fff","#f0f","#ff0","#0ff","#0f0","#fa0"];
var fishHeight = (c.height-64)/4;
var data128 = new Uint8Array(128);
var data1024 = new Uint8Array(1024);

for (var i=0; i<6; ++i) {
	tracks[i] = {};
	if (i) tracks[i].au = new Audio();
}

if (window.MediaRecorder) {
	navigator.mediaDevices.getUserMedia({audio:true})
	.then(function(stream) {
		gStream = stream;
//		c.onmousedown();	// png autoplay

		recorder = new MediaRecorder(stream);
		recorder.ondataavailable = function(e) {
			tracks[recIndex].au.src = URL.createObjectURL(e.data);
			tracks[recIndex].au.currentTime = 0.1;
			tracks[recIndex].au.play();
			recIndex = 0;
		}
	})
	.catch(function(e) {
		gStream = 1;
//		c.onmousedown();	// png autoplay
	})
} else {
	gStream = 1;
}

var player = new CPlayer();
player.init(song);	// png inline song json
var generator = setInterval(function() {
	if (generated = player.generate() >= 1) {
		clearInterval(generator);
//		c.onmousedown();	// png autoplay
	}
},0)

c.onmousedown = function(e) {
	if (audioContext) {
//		audioContext.resume();	// png autoplay

		var i = Math.ceil(((e.touches ? e.touches[0].pageY : e.pageY) - c.offsetTop - 64) / fishHeight);
		if (audioContext.currentTime - playTime > tracks[0].bu.duration) {
			playing = 0;
		}

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

			if (i == 5 && gStream != 1) {
				var source = audioContext.createMediaStreamSource(gStream);
				source.connect(tracks[i].an);
			}
			else if (i && i<5) {
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
		})
	}
}

function play() {
	stop = 0;
	playing = 1;
	for (var i=0; i<5; ++i) {
		if (tracks[i].bu) {
			var source = audioContext.createBufferSource();
			source.buffer = tracks[i].bu;
			source.connect(tracks[i].an);
			source.start(0);

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
						} else {
							gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
							recorder.start();
							recording = 1;
						}
					}
					play();
				}
			}
		}
		else if (tracks[i].au.src) {
			tracks[i].au.currentTime = 0.1;
			tracks[i].au.play();
		}
	}
}

function draw(time) {
	a.clearRect(0, 0, c.width, c.height);

	var dWidth = c.width / data128.length
	a.lineWidth = 1;
	for (var i=0; i<5; ++i) {
		if (!i || tracks[i].au.src) {
			tracks[i].an.getByteFrequencyData(data128);

			if (mode) {
				for (var j = data128.length-1; j >= 0; --j) {
					var h = data128[j]/-255 * c.height;
					var gradient = a.createLinearGradient(0, c.height, 0, c.height + h);
					gradient.addColorStop(0, "rgba(0,0,0,0)");
					gradient.addColorStop(1, stop ? "#000" : styles[i]);
					a.fillStyle = gradient;
					a.fillRect((j + i/5) * dWidth, c.height, 1, h);
				}
			} else {
				a.strokeStyle = stop ? "#000" : styles[i];
				a.beginPath();
				for (var j = data128.length/2; j >= 0; --j) {
					var y = 541 - data128[j]*2;
					a.moveTo((j+1)*15, y);
					a.lineTo(j*15, y);
				}
				a.stroke();
			}
		}
	}

	var offset = (data1024.length - c.width)/2
	gAnalyser.getByteTimeDomainData(data1024);
	a.fillStyle = "#000";
	a.beginPath();
	a.moveTo(c.width, 0);
	for (var i = c.width; i >= 0; --i) {
		a.lineTo(i, data1024[i + offset]/2);
	}
	a.lineTo(0,0);
	a.fill();

	var x = ((playTime - audioContext.currentTime) / tracks[0].bu.duration + 1) * c.width;
	var r = 64;
	a.lineWidth = 2;
	a.strokeStyle = "#fff";
	a.beginPath();
	for (var i=1; i<5; ++i) {
		var y = fishHeight * (i-0.5) + 64;

		if (recording && i == recIndex) {
			tracks[5].an.getByteTimeDomainData(data128);
			a.moveTo(x+r, y);
			var dx = (x+r) / data128.length;
			for (var j = data128.length-1; j >= 0; --j) {
				a.lineTo(dx*j, y + (data128[j]-128)/2);
			}
		}
		else if (tracks[i].au.src) {
			tracks[i].an.getByteTimeDomainData(data128);
			a.moveTo(x+r, y);
			for (var j = data128.length-1; j >= 0; --j) {
				a.lineTo(x-r+j, y + (data128[j]-128)/4);
			}
		}
	}
	a.stroke();

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
		var gradient = a.createRadialGradient(x-32, y, 0, x, y, rx + sin*4);
		gradient.addColorStop(0, "rgba(255,255,255,0)");
		gradient.addColorStop(1, i == recIndex ? styles[5] : styles[i]);
		a.fillStyle = gradient;
		a.beginPath();
		a.moveTo(x-r, y);
		a.lineTo(x-rx, y-my);
		a.quadraticCurveTo(x, y-ry, x+rx, y);
		a.quadraticCurveTo(x, y+ry, x-rx, y+my);
		a.fill();

		var ey = y-16 - sin;
		gradient = a.createRadialGradient(ex, ey, 0, ex, ey, 16);
		gradient.addColorStop(0, "rgba(255,255,255,0)");
		gradient.addColorStop(1, "rgba(255,255,255,1)");
		a.fillStyle = gradient;
		a.beginPath();
		a.ellipse(ex, ey, 8, 12, 0, 0, 2*Math.PI);
		a.fill();

		var fy = y-32 - sin*2;
		gradient = a.createRadialGradient(fx+32, fy - sin*4, 0, fx+32, fy - sin*4, 32);
		gradient.addColorStop(0, "rgba(255,255,191,0)");
		gradient.addColorStop(1, "rgba(255,255,191,1)");
		a.fillStyle = gradient;
		a.beginPath();
		a.moveTo(fx, fy);
		a.quadraticCurveTo(fx+32, fy-32 - sin*8, fx+64, fy-16 - sin*8);
		a.fill();

		drawTail(0);
		drawTail(1/3);
		drawTail(2/3);
	}

	function drawTail(i) {
		var sin = Math.sin((theta+i) * 2*Math.PI);
		gradient = a.createRadialGradient(tx+16, y - sin*8, 0, tx+16, y - sin*8, 48);
		gradient.addColorStop(0, "rgba(191,255,255,0)");
		gradient.addColorStop(1, "rgba(191,255,255,1)");
		a.fillStyle = gradient;
		a.beginPath();
		a.moveTo(tx, y);
		a.quadraticCurveTo(tx+40, y-16 - sin*16, tx+48, y - sin*16);
		a.quadraticCurveTo(tx+40, y+16 - sin*16, tx, y);
		a.fill();
	}

	fpsCount++;
	if (time - fpsTime > 984) {
		fpsText = fpsCount + "fps";
		fpsTime = time;
		fpsCount = 0;
	}
	a.fillStyle = "#fff";
	a.fillText(fpsText, 1, 12);

	requestAnimationFrame(draw);
}
