"use strict";

var CPlayer = function() {

	//--------------------------------------------------------------------------
	// Private methods
	//--------------------------------------------------------------------------

	// Oscillators
	var osc_sin = function (value) {
		return Math.sin(value * 6.283184);
	};

	var osc_saw = function (value) {
		return 2 * (value % 1) - 1;
	};

	var osc_square = function (value) {
		return (value % 1) < 0.5 ? 1 : -1;
	};

	var osc_tri = function (value) {
		var v2 = (value % 1) * 4;
		if(v2 < 2) return v2 - 1;
		return 3 - v2;
	};

	var getnotefreq = function (n) {
		// 174.61.. / 44100 = 0.003959503758 (F3)
		return 0.003959503758 * Math.pow(2, (n - 128) / 12);
	};

	var createNote = function (instr, n, rowLen) {
		var osc1 = mOscillators[instr.i[0]],
			o1vol = instr.i[1],
			o1xenv = instr.i[3],
			osc2 = mOscillators[instr.i[4]],
			o2vol = instr.i[5],
			o2xenv = instr.i[8],
			noiseVol = instr.i[9],
			attack = instr.i[10] * instr.i[10] * 4,
			sustain = instr.i[11] * instr.i[11] * 4,
			release = instr.i[12] * instr.i[12] * 4,
			releaseInv = 1 / release,
			arp = instr.i[13],
			arpInterval = rowLen * Math.pow(2, 2 - instr.i[14]);

		var noteBuf = new Int32Array(attack + sustain + release);

		// Re-trig oscillators
		var c1 = 0, c2 = 0;

		// Local variables.
		var j, j2, e, t, rsample, o1t, o2t;

		// Generate one note (attack + sustain + release)
		for (j = 0, j2 = 0; j < attack + sustain + release; j++, j2++) {
			if (j2 >= 0) {
				// Switch arpeggio note.
				arp = (arp >> 8) | ((arp & 255) << 4);
				j2 -= arpInterval;

				// Calculate note frequencies for the oscillators
				o1t = getnotefreq(n + (arp & 15) + instr.i[2] - 128);
				o2t = getnotefreq(n + (arp & 15) + instr.i[6] - 128) * (1 + 0.0008 * instr.i[7]);
			}

			// Envelope
			e = 1;
			if (j < attack) {
				e = j / attack;
			} else if (j >= attack + sustain) {
				e -= (j - attack - sustain) * releaseInv;
			}

			// Oscillator 1
			t = o1t;
			if (o1xenv) {
				t *= e * e;
			}
			c1 += t;
			rsample = osc1(c1) * o1vol;

			// Oscillator 2
			t = o2t;
			if (o2xenv) {
				t *= e * e;
			}
			c2 += t;
			rsample += osc2(c2) * o2vol;

			// Noise oscillator
			if (noiseVol) {
				rsample += (2 * Math.random() - 1) * noiseVol;
			}

			// Add to (mono) channel buffer
			noteBuf[j] = (80 * rsample * e) | 0;
		}

		return noteBuf;
	};


	//--------------------------------------------------------------------------
	// Private members
	//--------------------------------------------------------------------------

	// Array of oscillator functions
	var mOscillators = [
		osc_sin,
		osc_square,
		osc_saw,
		osc_tri
	];

	// Private variables set up by init()
	var mSong, mLastRow, mCurrentCol, mNumWords, mMixBuf;


	//--------------------------------------------------------------------------
	// Initialization
	//--------------------------------------------------------------------------

	this.init = function (song) {
		// Define the song
		mSong = song;

		// Init iteration state variables
		mLastRow = song.endPattern;
		mCurrentCol = 0;

		// Prepare song info
		mNumWords =  song.rowLen * song.patternLen * (mLastRow + 1) * 2;

		// Create work buffer (initially cleared)
		mMixBuf = new Int32Array(mNumWords);
	};


	//--------------------------------------------------------------------------
	// Public methods
	//--------------------------------------------------------------------------

	// Generate audio data for a single track
	this.generate = function () {
		// Local variables
		var i, j, b, p, row, col, n, cp,
			k, t, lfor, e, x, rsample, rowStartSample, f, da;

		// Put performance critical items in local variables
		var chnBuf = new Int32Array(mNumWords),
			instr = mSong.songData[mCurrentCol],
			rowLen = mSong.rowLen,
			patternLen = mSong.patternLen;

		// Clear effect state
		var low = 0, band = 0, high;
		var lsample, filterActive = false;

		// Clear note cache.
		var noteCache = [];

		 // Patterns
		 for (p = 0; p <= mLastRow; ++p) {
			cp = instr.p[p];

			// Pattern rows
			for (row = 0; row < patternLen; ++row) {
				// Execute effect command.
				var cmdNo = cp ? instr.c[cp - 1].f[row] : 0;
				if (cmdNo) {
					instr.i[cmdNo - 1] = instr.c[cp - 1].f[row + patternLen] || 0;

					// Clear the note cache since the instrument has changed.
					if (cmdNo < 16) {
						noteCache = [];
					}
				}

				// Put performance critical instrument properties in local variables
				var oscLFO = mOscillators[instr.i[15]],
					lfoAmt = instr.i[16] / 512,
					lfoFreq = Math.pow(2, instr.i[17] - 9) / rowLen,
					fxLFO = instr.i[18],
					fxFilter = instr.i[19],
					fxFreq = instr.i[20] * 43.23529 * 3.141592 / 44100,
					q = 1 - instr.i[21] / 255,
					dist = instr.i[22] * 1e-5,
					drive = instr.i[23] / 32,
					panAmt = instr.i[24] / 512,
					panFreq = 6.283184 * Math.pow(2, instr.i[25] - 9) / rowLen,
					dlyAmt = instr.i[26] / 255,
					dly = instr.i[27] * rowLen & ~1;  // Must be an even number

				// Calculate start sample number for this row in the pattern
				rowStartSample = (p * patternLen + row) * rowLen;

				// Generate notes for this pattern row
				for (col = 0; col < 4; ++col) {
					n = cp ? instr.c[cp - 1].n[row + col * patternLen] : 0;
					if (n) {
						if (!noteCache[n]) {
							noteCache[n] = createNote(instr, n, rowLen);
						}

						// Copy note from the note cache
						var noteBuf = noteCache[n];
						for (j = 0, i = rowStartSample * 2; j < noteBuf.length; j++, i += 2) {
						  chnBuf[i] += noteBuf[j];
						}
					}
				}

				// Perform effects for this pattern row
				for (j = 0; j < rowLen; j++) {
					// Dry mono-sample
					k = (rowStartSample + j) * 2;
					rsample = chnBuf[k];

					// We only do effects if we have some sound input
					if (rsample || filterActive) {
						// State variable filter
						f = fxFreq;
						if (fxLFO) {
							f *= oscLFO(lfoFreq * k) * lfoAmt + 0.5;
						}
						f = 1.5 * Math.sin(f);
						low += f * band;
						high = q * (rsample - band) - low;
						band += f * high;
						rsample = fxFilter == 3 ? band : fxFilter == 1 ? high : low;

						// Distortion
						if (dist) {
							rsample *= dist;
							rsample = rsample < 1 ? rsample > -1 ? osc_sin(rsample*.25) : -1 : 1;
							rsample /= dist;
						}

						// Drive
						rsample *= drive;

						// Is the filter active (i.e. still audiable)?
						filterActive = rsample * rsample > 1e-5;

						// Panning
						t = Math.sin(panFreq * k) * panAmt + 0.5;
						lsample = rsample * (1 - t);
						rsample *= t;
					} else {
						lsample = 0;
					}

					// Delay is always done, since it does not need sound input
					if (k >= dly) {
						// Left channel = left + right[-p] * t
						lsample += chnBuf[k-dly+1] * dlyAmt;

						// Right channel = right + left[-p] * t
						rsample += chnBuf[k-dly] * dlyAmt;
					}

					// Store in stereo channel buffer (needed for the delay effect)
					chnBuf[k] = lsample | 0;
					chnBuf[k+1] = rsample | 0;

					// ...and add to stereo mix buffer
					mMixBuf[k] += lsample | 0;
					mMixBuf[k+1] += rsample | 0;
				}
			}
		}

		// Next iteration. Return progress (1.0 == done!).
		mCurrentCol++;
		return mCurrentCol / mSong.numChannels;
	};

	// Create a WAVE formatted Uint8Array from the generated audio data
	this.createWave = function() {
		// Create WAVE header
		var headerLen = 44;
		var l1 = headerLen + mNumWords * 2 - 8;
		var l2 = l1 - 36;
		var wave = new Uint8Array(headerLen + mNumWords * 2);
		wave.set(
			[82,73,70,70,
			 l1 & 255,(l1 >> 8) & 255,(l1 >> 16) & 255,(l1 >> 24) & 255,
			 87,65,86,69,102,109,116,32,16,0,0,0,1,0,2,0,
			 68,172,0,0,16,177,2,0,4,0,16,0,100,97,116,97,
			 l2 & 255,(l2 >> 8) & 255,(l2 >> 16) & 255,(l2 >> 24) & 255]
		);

		// Append actual wave data
		for (var i = 0, idx = headerLen; i < mNumWords; ++i) {
			// Note: We clamp here
			var y = mMixBuf[i];
			y = y < -32767 ? -32767 : (y > 32767 ? 32767 : y);
			wave[idx++] = y & 255;
			wave[idx++] = (y >> 8) & 255;
		}

		// Return the WAVE formatted typed array
		return wave;
	};

	// Get n samples of wave data at time t [s]. Wave data in range [-2,2].
	this.getData = function(t, n) {
		var i = 2 * Math.floor(t * 44100);
		var d = new Array(n);
		for (var j = 0; j < 2*n; j += 1) {
			var k = i + j;
			d[j] = t > 0 && k < mMixBuf.length ? mMixBuf[k] / 32768 : 0;
		}
		return d;
	};
};

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

a.fillRect(0, 0, c.width, 64);
a.font = "12px sans-serif";

var p = document.createElement("p");
p.style.color = "#ddd";
p.innerHTML = `Make a rap with loops! Talk into your <b>mic</b> to make the loops.<br>Tap anywhere on the canvas to <b>start</b>. The water surface shows the audio waveform, the bubbles show each track's spectrogram.<br>Tap on any of the 4 <b>fish</b>, it will turn <span style="color:#fa0">orange</span> when selected. On the next loop, a <span style="color:#fff">white</span> waveform will appear from the sound of the mic, and the fish will eat the sound. From the next loop, the fish will play back the sound.<br>Tap the area above the water (at the top of the canvas) to <b>stop</b> at the end of the loop. Double-tap to change track visualization.<br><br><b>Microphone</b> required for recording.<br>Due to lack of support for the MediaRecorder API, <b>recording will not work on iOS/Safari/Edge</b>. It works on Android/Chrome/Firefox.`;
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
	c.onmousedown();
})

for (var i=0; i<6; ++i) {
	tracks[i] = {};
	tracks[i].of = 0;
	if (i > 0) tracks[i].au = new Audio();
}

var player = new CPlayer();
player.init({songData:[{i:[0,255,116,1,0,255,116,0,1,0,4,6,35,0,0,0,0,0,0,2,14,0,0,32,0,0,0,0],p:[1],c:[{n:[135,,135,,,,135,135,,,135,,,,135,,135,,135,,,,135,135,,,135,,,,135],f:[]}]},{i:[0,160,128,1,0,160,128,0,1,210,4,7,41,0,0,0,60,4,1,2,255,0,0,32,61,5,32,6],p:[1],c:[{n:[,,,,135,,,,,,,,135,,,,,,,,135,,,,,,,,135],f:[]}]},{i:[0,0,140,0,0,0,140,0,0,60,4,10,34,0,0,0,187,5,0,1,239,135,0,32,108,5,16,4],p:[1],c:[{n:[135,,135,,,,135,135,135,,135,,,,135,135,135,,135,,,,135,135,135,,135,,,,135],f:[]}]}],rowLen:5513,patternLen:32,endPattern:0,numChannels:3});
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
	a.fillText(fpsText + (stop ? " stop" : ""), 1, 12);

	requestAnimationFrame(draw);
}
