// audio.js - Web Audio API sound effects with noise-based gunfire

export class AudioSystem {
    constructor() {
        this.ctx = null;
        this.enabled = true;
        this.volume = 0.3;
        this.noiseBuffer = null;
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this._createNoiseBuffer();
        } catch (e) {
            this.enabled = false;
        }
    }

    _createNoiseBuffer() {
        const len = this.ctx.sampleRate * 0.5;
        this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const data = this.noiseBuffer.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }

    _playNoise(duration, freq, vol, filterType = 'lowpass') {
        const src = this.ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = filterType;
        const gain = this.ctx.createGain();
        const now = this.ctx.currentTime;
        filter.frequency.setValueAtTime(freq, now);
        filter.frequency.exponentialRampToValueAtTime(100, now + duration);
        gain.gain.setValueAtTime(vol, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
        src.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        src.start(now);
        src.stop(now + duration);
    }

    resume() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    playShoot(type = 'ar', volumeMult = 1) {
        if (!this.enabled || !this.ctx) return;
        const v = this.volume * volumeMult;
        const now = this.ctx.currentTime;

        // Noise burst for punch
        this._playNoise(
            type === 'sniper' ? 0.25 : type === 'shotgun' ? 0.15 : 0.08,
            type === 'sniper' ? 3000 : type === 'shotgun' ? 1500 : 2000,
            v * (type === 'sniper' ? 0.5 : type === 'shotgun' ? 0.45 : 0.25)
        );

        // Tonal component
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);

        switch (type) {
            case 'pistol':
                osc.type = 'square';
                osc.frequency.setValueAtTime(900, now);
                osc.frequency.exponentialRampToValueAtTime(150, now + 0.06);
                gain.gain.setValueAtTime(v * 0.2, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
                osc.start(now); osc.stop(now + 0.08);
                break;
            case 'shotgun':
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(250, now);
                osc.frequency.exponentialRampToValueAtTime(40, now + 0.12);
                gain.gain.setValueAtTime(v * 0.35, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
                osc.start(now); osc.stop(now + 0.15);
                break;
            case 'ar':
                osc.type = 'square';
                osc.frequency.setValueAtTime(700, now);
                osc.frequency.exponentialRampToValueAtTime(120, now + 0.05);
                gain.gain.setValueAtTime(v * 0.15, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
                osc.start(now); osc.stop(now + 0.06);
                break;
            case 'sniper':
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(1400, now);
                osc.frequency.exponentialRampToValueAtTime(60, now + 0.25);
                gain.gain.setValueAtTime(v * 0.4, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
                osc.start(now); osc.stop(now + 0.3);
                break;
        }
    }

    playPickup() {
        if (!this.enabled || !this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.type = 'sine';
        const now = this.ctx.currentTime;
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.linearRampToValueAtTime(900, now + 0.1);
        gain.gain.setValueAtTime(this.volume * 0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.start(now); osc.stop(now + 0.15);
    }

    playHit() {
        // Hit marker "ding" sound
        if (!this.enabled || !this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.type = 'sine';
        const now = this.ctx.currentTime;
        osc.frequency.setValueAtTime(1800, now);
        osc.frequency.exponentialRampToValueAtTime(1200, now + 0.06);
        gain.gain.setValueAtTime(this.volume * 0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.start(now); osc.stop(now + 0.1);
        // Crunch
        this._playNoise(0.06, 800, this.volume * 0.15);
    }

    playHeadshot() {
        if (!this.enabled || !this.ctx) return;
        // Double ding for headshot
        const now = this.ctx.currentTime;
        for (let i = 0; i < 2; i++) {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.type = 'sine';
            const t = now + i * 0.06;
            osc.frequency.setValueAtTime(2200, t);
            osc.frequency.exponentialRampToValueAtTime(1600, t + 0.05);
            gain.gain.setValueAtTime(this.volume * 0.3, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
            osc.start(t); osc.stop(t + 0.08);
        }
        this._playNoise(0.08, 1200, this.volume * 0.2);
    }

    playDoorOpen() {
        if (!this.enabled || !this.ctx) return;
        this._playNoise(0.15, 600, this.volume * 0.15);
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.type = 'square';
        const now = this.ctx.currentTime;
        osc.frequency.setValueAtTime(250, now);
        osc.frequency.linearRampToValueAtTime(180, now + 0.12);
        gain.gain.setValueAtTime(this.volume * 0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.start(now); osc.stop(now + 0.15);
    }

    playHealComplete() {
        if (!this.enabled || !this.ctx) return;
        const now = this.ctx.currentTime;
        // Ascending chime
        [600, 800, 1000].forEach((freq, i) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.type = 'sine';
            const t = now + i * 0.08;
            osc.frequency.setValueAtTime(freq, t);
            gain.gain.setValueAtTime(this.volume * 0.15, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
            osc.start(t); osc.stop(t + 0.12);
        });
    }

    playKill() {
        if (!this.enabled || !this.ctx) return;
        const now = this.ctx.currentTime;
        // Satisfying kill confirm
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.linearRampToValueAtTime(1200, now + 0.1);
        osc.frequency.linearRampToValueAtTime(1600, now + 0.2);
        gain.gain.setValueAtTime(this.volume * 0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.start(now); osc.stop(now + 0.25);
        this._playNoise(0.1, 2000, this.volume * 0.1, 'highpass');
    }

    playDeath() {
        if (!this.enabled || !this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.type = 'sawtooth';
        const now = this.ctx.currentTime;
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.5);
        gain.gain.setValueAtTime(this.volume * 0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc.start(now);
        osc.stop(now + 0.5);
    }

    playFootstep(surface = 'grass') {
        if (!this.enabled || !this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        const now = this.ctx.currentTime;

        if (surface === 'water') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(200 + Math.random() * 100, now);
            osc.frequency.exponentialRampToValueAtTime(80, now + 0.06);
            gain.gain.setValueAtTime(this.volume * 0.08, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        } else if (surface === 'building') {
            osc.type = 'square';
            osc.frequency.setValueAtTime(300 + Math.random() * 50, now);
            osc.frequency.exponentialRampToValueAtTime(150, now + 0.03);
            gain.gain.setValueAtTime(this.volume * 0.05, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
        } else {
            // Grass
            osc.type = 'sine';
            osc.frequency.setValueAtTime(100 + Math.random() * 60, now);
            osc.frequency.exponentialRampToValueAtTime(60, now + 0.04);
            gain.gain.setValueAtTime(this.volume * 0.04, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        }
        osc.start(now);
        osc.stop(now + 0.1);
    }

    playVehicle() {
        if (!this.enabled || !this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.type = 'sawtooth';
        const now = this.ctx.currentTime;
        osc.frequency.setValueAtTime(80, now);
        osc.frequency.setValueAtTime(90, now + 0.05);
        gain.gain.setValueAtTime(this.volume * 0.06, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
    }

    playReload() {
        if (!this.enabled || !this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.type = 'square';
        const now = this.ctx.currentTime;
        // Click-clack sound
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.setValueAtTime(200, now + 0.05);
        osc.frequency.setValueAtTime(500, now + 0.15);
        osc.frequency.setValueAtTime(250, now + 0.2);
        gain.gain.setValueAtTime(this.volume * 0.1, now);
        gain.gain.setValueAtTime(0.001, now + 0.08);
        gain.gain.setValueAtTime(this.volume * 0.12, now + 0.15);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
    }

    playExplosion() {
        if (!this.enabled || !this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.type = 'sawtooth';
        const now = this.ctx.currentTime;
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(20, now + 0.5);
        gain.gain.setValueAtTime(this.volume * 0.7, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
        osc.start(now);
        osc.stop(now + 0.6);
    }

    playAmbient() {
        if (!this.enabled || !this.ctx) return;
        // Gentle wind/nature ambient sound
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.type = 'sine';
        const now = this.ctx.currentTime;
        const freq = 80 + Math.random() * 60;
        osc.frequency.setValueAtTime(freq, now);
        osc.frequency.linearRampToValueAtTime(freq + 20, now + 1);
        osc.frequency.linearRampToValueAtTime(freq - 10, now + 2);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(this.volume * 0.02, now + 0.5);
        gain.gain.linearRampToValueAtTime(0, now + 2);
        osc.start(now);
        osc.stop(now + 2);
    }

    playZoneWarning() {
        if (!this.enabled || !this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.type = 'sine';
        const now = this.ctx.currentTime;
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.linearRampToValueAtTime(880, now + 0.3);
        osc.frequency.linearRampToValueAtTime(440, now + 0.6);
        gain.gain.setValueAtTime(this.volume * 0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
        osc.start(now);
        osc.stop(now + 0.6);
    }
}
