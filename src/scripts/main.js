// Clock and Weather widget - Developer: Nawaf AlMutairi | https://Nawaf-Blog.com/NM
// Weather data by Open-Meteo.com (CC BY 4.0) - https://open-meteo.com/
(function () {

	/* ---------- iCUE settings ---------- */
	/* Must be a bare assignment: iCUE owns the binding of icueEvents (window.icueEvents would not reach it). */
	icueEvents = { onICUEInitialized: init, onDataUpdated: applySettings };

	/* Read-only accessors for the settings iCUE injects as globals (no dynamic code evaluation). */
	const GETTERS = {
		textColor: () => typeof textColor !== "undefined" ? textColor : undefined,
		mutedColor: () => typeof mutedColor !== "undefined" ? mutedColor : undefined,
		backgroundColor: () => typeof backgroundColor !== "undefined" ? backgroundColor : undefined,
		tempUnit: () => typeof tempUnit !== "undefined" ? tempUnit : undefined,
		dateType: () => typeof dateType !== "undefined" ? dateType : undefined,
		timeFormat: () => typeof timeFormat !== "undefined" ? timeFormat : undefined,
		detailsTime: () => typeof detailsTime !== "undefined" ? detailsTime : undefined,
		dateFormat: () => typeof dateFormat !== "undefined" ? dateFormat : undefined,
		weatherLocation: () => typeof weatherLocation !== "undefined" ? weatherLocation : undefined
	};
	function getIcueProperty(name) {
		const fromWindow = window[name];
		if (fromWindow !== undefined && fromWindow !== null && fromWindow !== "") return fromWindow;
		const getter = GETTERS[name];
		if (getter) {
			try {
				const v = getter();
				if (v !== undefined && v !== null && v !== "") return v;
			} catch (e) { /* ignore */ }
		}
		return undefined;
	}
	function prop(name, fallback) {
		let v = getIcueProperty(name);
		if (v === undefined) return fallback;
		if (typeof v === "object" && v !== null && "key" in v) v = v.key;
		return v;
	}

	const $ = id => document.getElementById(id);
	function safeColor(v, fallback) { v = String(v); return /^#[0-9a-fA-F]{3,8}$/.test(v) ? v : fallback; }
	document.documentElement.lang = (navigator.language || "en");
	let cfgKey = "";

	function applySettings() {
		const st = document.documentElement.style;
		st.setProperty("--fg", safeColor(prop("textColor", "#FFFFFF"), "#FFFFFF"));
		st.setProperty("--muted", safeColor(prop("mutedColor", "#B4B4B4"), "#B4B4B4"));
		st.setProperty("--bg", safeColor(prop("backgroundColor", "#000000"), "#000000"));
		const key = [prop("weatherLocation", ""), prop("tempUnit", "C")].join("|");
		last.dateNum = null; last.dateDay = null; fitKey = "";
		if (key !== cfgKey) { cfgKey = key; refreshWeather(); }
	}

	/* تحويل رقم المدينة المختارة إلى إحداثيات (مع تخزين مؤقت) */
	const locCache = {};
	const locInfo = {};
	async function resolveLocation(id) {
		if (!id) throw new Error("no city");
		if (locCache[id]) return locCache[id];
		const ctl = new AbortController();
		const to = setTimeout(() => ctl.abort(), 10000);
		try {
			const r = await fetch("https://geocoding-api.open-meteo.com/v1/get?id=" + encodeURIComponent(id) + "&language=en", { signal: ctl.signal });
			if (!r.ok) throw new Error("HTTP " + r.status);
			const d = await r.json();
			if (typeof d.latitude !== "number" || typeof d.longitude !== "number" || !isFinite(d.latitude) || !isFinite(d.longitude)) throw new Error("bad location");
			locInfo[id] = {
				name: typeof d.name === "string" ? d.name.slice(0, 60) : "",
				cc: typeof d.country === "string" && d.country ? d.country.slice(0, 60) : (typeof d.country_code === "string" ? d.country_code.toUpperCase().slice(0, 3) : "")
			};
			return (locCache[id] = [d.latitude, d.longitude]);
		} finally { clearTimeout(to); }
	}

	/* اسم المدينة والدولة (بالإنجليزية دائمًا) تحت التاريخ، مثال: Riyadh | Saudi Arabia */
	function showCity(id) {
		const box = $("cityBox"), info = id ? locInfo[id] : null;
		if (!info || !info.name) { box.hidden = true; return; }
		$("cityName").textContent = info.name;
		$("cityCc").textContent = info.cc;
		$("citySep").style.display = info.cc ? "" : "none";
		box.hidden = false;
		fitKey = "";
		if (typeof fitDate === "function") fitDate();
	}

	/* ---------- الساعة والتاريخ ---------- */
	const pad = n => String(n).padStart(2, "0");
	const last = {};
	function setText(id, v) { if (last[id] !== v) { last[id] = v; $(id).textContent = v; } }

	/* التاريخ: اسم اليوم بلغة النظام، والتقويم ميلادي أو هجري حسب الإعداد */
	const SYS_LOCALE = (navigator.language || (navigator.languages && navigator.languages[0]) || "en");
	const RTL_LANGS = ["ar", "he", "fa", "ur", "ps", "sd", "ug", "yi", "dv"];
	const IS_RTL = RTL_LANGS.indexOf(SYS_LOCALE.split("-")[0].toLowerCase()) >= 0;
	function fmt(opts, d) {
		try { return new Intl.DateTimeFormat(SYS_LOCALE, opts).format(d); }
		catch (e) { return new Intl.DateTimeFormat("en", opts).format(d); }
	}
	function dateInfo(d) {
		const hijri = String(prop("dateType", "gregorian")) === "hijri";
		const style = String(prop("dateFormat", "wd_dmy"));
		const cal = hijri ? { calendar: "islamic-umalqura", numberingSystem: "latn" } : { numberingSystem: "latn" };
		const day = fmt({ weekday: "long", numberingSystem: "latn" }, d);

		let dd, mm, yy, month;
		try {
			const parts = new Intl.DateTimeFormat("en", Object.assign({ day: "numeric", month: "numeric", year: "numeric" }, hijri ? { calendar: "islamic-umalqura", numberingSystem: "latn" } : {})).formatToParts(d);
			const get = t => (parts.find(p => p.type === t) || {}).value;
			dd = parseInt(get("day"), 10); mm = parseInt(get("month"), 10); yy = parseInt(get("year"), 10);
		} catch (e) { dd = 0; }
		if (!(dd > 0)) { dd = d.getDate(); mm = d.getMonth() + 1; yy = d.getFullYear(); }
		try { month = fmt(Object.assign({ month: "long" }, cal), d); } catch (e) { month = pad(mm); }

		const D = pad(dd), M = pad(mm), Y = String(yy);
		let main = "", withDay = false, text = false;
		switch (style) {
			case "wd_dmy_slash": main = D + "/" + M + "/" + Y; withDay = true; break;
			case "wd_ymd":       main = Y + "-" + M + "-" + D; withDay = true; break;
			case "wd_long":      main = dd + " " + month + " " + Y; withDay = true; text = true; break;
			case "long":         main = dd + " " + month + " " + Y; text = true; break;
			case "dmy":          main = D + "-" + M + "-" + Y; break;
			case "dmy_slash":    main = D + "/" + M + "/" + Y; break;
			case "d_month":      main = dd + " " + month; text = true; break;
			case "weekday":      main = ""; withDay = true; break;
			default:             main = D + "-" + M + "-" + Y; withDay = true;   // wd_dmy
		}
		return { day: withDay ? day : "", num: main, rtl: IS_RTL, text: text };
	}

	/* يجعل عرض التاريخ مساويًا لعرض الساعة بالضبط */
	let fitKey = "";
	function fitDate() {
		const clock = document.querySelector(".clock"), el = $("date"), fit = $("dateFit");
		if (!clock || !el || !fit) return;
		if ($("layout").classList.contains("show-details")) return;
		const key = last.dateDay + "|" + last.dateNum + "|" + clock.offsetWidth;
		if (key === fitKey) return;
		el.style.fontSize = "";
		const base = parseFloat(getComputedStyle(el).fontSize);
		const target = clock.getBoundingClientRect().width, w = fit.getBoundingClientRect().width;
		if (w > 0 && target > 0) el.style.fontSize = (base * Math.min(target / w, 1.6)) + "px";
		fitKey = last.dateDay + "|" + last.dateNum + "|" + clock.offsetWidth;
		const cityEl = $("city");
		if (cityEl && !$("cityBox").hidden) {
			cityEl.style.fontSize = "";
			const room = el.clientWidth, cw = cityEl.scrollWidth;
			if (room > 0 && cw > room) cityEl.style.fontSize = (parseFloat(getComputedStyle(cityEl).fontSize) * room / cw) + "px";
		}
	}
	window.addEventListener("resize", () => { fitKey = ""; fitDate(); });
	if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { fitKey = ""; fitDate(); });

	function tick() {
		const d = new Date();
		try {
		let h = d.getHours();
		const h24 = String(prop("timeFormat", "12h")) === "24h";
		const ap = h >= 12 ? "PM" : "AM";
		if (!h24) h = h % 12 || 12;
		const sideEl = $("side");
		if (sideEl.classList.contains("h24") !== h24) { sideEl.classList.toggle("h24", h24); fitKey = ""; }
		const hh = pad(h), mm = pad(d.getMinutes());
		setText("h1", hh[0]); setText("h2", hh[1]); setText("m1", mm[0]); setText("m2", mm[1]);
		setText("sec", pad(d.getSeconds())); setText("ap", ap);
		const info = dateInfo(d);
		setText("dateNum", info.num);
		setText("dateDay", info.day);
		const cls = "date " + (info.rtl ? "rtl" : "ltr") + (info.text ? " txt" : "") + (info.day ? "" : " noday") + (info.num ? "" : " nomain");
		if ($("date").className !== cls) { $("date").className = cls; fitKey = ""; }
		fitDate();
		} catch (e) { /* keep the clock alive */ }
		setTimeout(tick, 1000 - d.getMilliseconds() + 5);
	}

	/* ---------- أيقونات الطقس (SVG) ---------- */
	const CLOUD = '<path d="M18 50h29a12 12 0 0 0 1.5-23.9A16 16 0 0 0 17.6 29 10.8 10.8 0 0 0 18 50z" fill="currentColor"/>';
	const SUN = (cx, cy, r, ray) => {
		let s = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="currentColor"/>`;
		for (let i = 0; i < 8; i++) {
			const a = i * Math.PI / 4, c = Math.cos(a), si = Math.sin(a);
			s += `<line x1="${cx + c * (r + 4)}" y1="${cy + si * (r + 4)}" x2="${cx + c * (r + ray)}" y2="${cy + si * (r + ray)}" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/>`;
		}
		return s;
	};
	const MOON = (tx, ty, sc) => `<path transform="translate(${tx} ${ty}) scale(${sc})" d="M38 6a26 26 0 1 0 20 42A21 21 0 0 1 38 6z" fill="currentColor"/>`;
	const wrap = (cls, inner) => `<svg viewBox="0 0 64 64" class="${cls}">${inner}</svg>`;

	function weatherIcon(code, isDay) {
		const cloudy = `<g class="ico-cloud">${CLOUD}</g>`;
		if (code === 0 || code === 1) return isDay ? wrap("ico-sun", SUN(32, 32, 11, 10)) : wrap("ico-moon", MOON(4, 4, 0.9));
		if (code === 2) return wrap("", (isDay ? `<g class="ico-sun">${SUN(22, 22, 8, 7)}</g>` : `<g class="ico-moon">${MOON(0, -2, 0.55)}</g>`) + `<g class="ico-cloud" transform="translate(8 8) scale(.85)">${CLOUD}</g>`);
		if (code === 3) return wrap("", cloudy);
		if (code === 45 || code === 48) return wrap("", `<g class="ico-cloud" transform="translate(0 -6)">${CLOUD}</g><g stroke="#D6DCE6" stroke-width="4" stroke-linecap="round"><line x1="14" y1="52" x2="50" y2="52"/><line x1="20" y1="59" x2="56" y2="59"/></g>`);
		if ((code >= 71 && code <= 77) || code === 85 || code === 86) return wrap("", `<g class="ico-cloud" transform="translate(0 -6)">${CLOUD}</g><g fill="#fff"><circle cx="22" cy="54" r="3"/><circle cx="34" cy="58" r="3"/><circle cx="46" cy="54" r="3"/></g>`);
		if (code >= 95) return wrap("", `<g class="ico-cloud" transform="translate(0 -8)">${CLOUD}</g><polygon points="35,40 25,56 33,56 29,64 41,47 33,47" fill="${"#FFC83D"}"/>`);
		/* مطر / رذاذ / زخات */
		return wrap("", `<g class="ico-cloud" transform="translate(0 -8)">${CLOUD}</g><g stroke="#4FB3FF" stroke-width="4" stroke-linecap="round"><line x1="22" y1="46" x2="18" y2="56"/><line x1="34" y1="46" x2="30" y2="56"/><line x1="46" y1="46" x2="42" y2="56"/></g>`);
	}

	function dropIcon(pct) {
		const d = "M32 5C32 5 12 28 12 41a20 20 0 0 0 40 0C52 28 32 5 32 5z";
		const p = isFinite(pct) ? Math.max(0, Math.min(100, pct)) : 0;
		const y = 61 - 56 * p / 100;
		return `<svg viewBox="0 0 64 64"><defs><clipPath id="dc"><path d="${d}"/></clipPath></defs>
			<path d="${d}" fill="none" stroke="var(--drop)" stroke-width="3.5" stroke-linejoin="round"/>
			<rect x="0" y="${y}" width="64" height="64" fill="var(--drop)" clip-path="url(#dc)"/></svg>`;
	}

	/* ---------- الطقس (Open-Meteo) ---------- */
	const RAIN_CODES = c => (c >= 51 && c <= 67) || (c >= 80 && c <= 82) || c >= 95;
	let wx = null, timer = null;

	/* نصوص الطقس حسب لغة النظام */
	const TXT = {
		ar: ["نهار", "ليل", "احتمال أمطار", "أمطار الآن", "الحرارة المحسوسة", "الرطوبة", "سرعة الرياح", "الشروق", "الغروب"],
		en: ["Day", "Night", "Chance of rain", "Raining now", "Feels like", "Humidity", "Wind speed", "Sunrise", "Sunset"],
		fr: ["Jour", "Nuit", "Risque de pluie", "Pluie en cours", "Ressenti", "Humidité", "Vent", "Lever du soleil", "Coucher du soleil"],
		de: ["Tag", "Nacht", "Regenrisiko", "Es regnet", "Gefühlt", "Luftfeuchtigkeit", "Wind", "Sonnenaufgang", "Sonnenuntergang"],
		es: ["Día", "Noche", "Prob. de lluvia", "Lloviendo", "Sensación térmica", "Humedad", "Viento", "Amanecer", "Atardecer"],
		pt: ["Dia", "Noite", "Chance de chuva", "Chovendo", "Sensação térmica", "Umidade", "Vento", "Nascer do sol", "Pôr do sol"],
		it: ["Giorno", "Notte", "Prob. pioggia", "Piove ora", "Percepita", "Umidità", "Vento", "Alba", "Tramonto"],
		nl: ["Dag", "Nacht", "Kans op regen", "Het regent", "Gevoelstemp.", "Luchtvochtigheid", "Wind", "Zonsopkomst", "Zonsondergang"],
		tr: ["Gündüz", "Gece", "Yağmur ihtimali", "Şu an yağmurlu", "Hissedilen", "Nem", "Rüzgar", "Gün doğumu", "Gün batımı"],
		ru: ["День", "Ночь", "Вероятность дождя", "Идёт дождь", "Ощущается", "Влажность", "Ветер", "Восход", "Закат"],
		pl: ["Dzień", "Noc", "Szansa na deszcz", "Pada deszcz", "Odczuwalna", "Wilgotność", "Wiatr", "Wschód słońca", "Zachód słońca"],
		zh: ["白天", "夜晚", "降雨概率", "正在下雨", "体感温度", "湿度", "风速", "日出", "日落"],
		ja: ["昼", "夜", "降水確率", "降雨中", "体感温度", "湿度", "風速", "日の出", "日の入り"],
		ko: ["낮", "밤", "강수 확률", "비 오는 중", "체감 온도", "습도", "풍속", "일출", "일몰"],
		fa: ["روز", "شب", "احتمال باران", "اکنون باران می‌بارد", "دمای احساسی", "رطوبت", "سرعت باد", "طلوع", "غروب"],
		ur: ["دن", "رات", "بارش کا امکان", "ابھی بارش ہو رہی ہے", "محسوس درجہ حرارت", "نمی", "ہوا کی رفتار", "طلوع آفتاب", "غروب آفتاب"],
		he: ["יום", "לילה", "סיכוי לגשם", "יורד גשם", "טמפ' מורגשת", "לחות", "מהירות רוח", "זריחה", "שקיעה"],
		hi: ["दिन", "रात", "बारिश की संभावना", "अभी बारिश हो रही है", "महसूस तापमान", "नमी", "हवा की गति", "सूर्योदय", "सूर्यास्त"],
		id: ["Siang", "Malam", "Peluang hujan", "Sedang hujan", "Terasa seperti", "Kelembapan", "Kecepatan angin", "Matahari terbit", "Matahari terbenam"]
	};
	const LANG = (SYS_LOCALE.split("-")[0] || "en").toLowerCase();
	const L = TXT[LANG] || TXT.en;

	/* أيقونات شاشة التفاصيل */
	const sv = (col, inner) => '<svg viewBox="0 0 64 64" style="color:' + col + '">' + inner + '</svg>';
	const D_ICO = {
		feels: sv("#FF8A5B", '<rect x="26" y="6" width="12" height="36" rx="6" fill="none" stroke="currentColor" stroke-width="4"/><circle cx="32" cy="46" r="11" fill="currentColor"/><rect x="29.5" y="20" width="5" height="26" rx="2.5" fill="currentColor"/>'),
		hum: sv("#4DB3FF", '<path d="M26 8C20 17 12 26 12 37a14 14 0 0 0 28 0C40 26 32 17 26 8z" fill="currentColor"/><path d="M47 28c-3 5-7 9-7 14a7 7 0 0 0 14 0c0-5-4-9-7-14z" fill="currentColor" opacity="0.6"/>'),
		wind: sv("#B8C4D0", '<path d="M6 24h32a7 7 0 1 0-7-7" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="M6 36h42a7 7 0 1 1-7 7" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="M6 48h20" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>'),
		rise: sv("#FFC83D", '<path d="M14 44a18 18 0 0 1 36 0z" fill="currentColor"/><line x1="6" y1="50" x2="58" y2="50" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="M32 6v16M25 13l7-7 7 7" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>'),
		set: sv("#FF9F43", '<path d="M14 44a18 18 0 0 1 36 0z" fill="currentColor"/><line x1="6" y1="50" x2="58" y2="50" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="M32 22V6M25 15l7 7 7-7" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>')
	};
	function fmtClock(iso) {
		const m = /T(\d{2}):(\d{2})/.exec(String(iso || ""));
		if (!m) return ["--", ""];
		let h = parseInt(m[1], 10);
		if (String(prop("timeFormat", "12h")) === "24h") return [pad(h) + ":" + m[2], ""];
		const ap = h >= 12 ? "PM" : "AM";
		h = h % 12 || 12;
		return [h + ":" + m[2], ap];
	}
	function setVal(id, main, unit) {
		const el = $(id);
		el.textContent = main;
		if (unit) { const s = document.createElement("small"); s.textContent = unit; el.appendChild(s); }
	}
	function renderDetails() {
		const w = wx || {};
		$("dFeelsIco").innerHTML = D_ICO.feels; $("dHumIco").innerHTML = D_ICO.hum; $("dWindIco").innerHTML = D_ICO.wind;
		$("dRiseIco").innerHTML = D_ICO.rise; $("dSetIco").innerHTML = D_ICO.set;
		$("dFeelsL").textContent = L[4]; $("dHumL").textContent = L[5]; $("dWindL").textContent = L[6];
		$("dRiseL").textContent = L[7]; $("dSetL").textContent = L[8];
		const num = v => typeof v === "number" && isFinite(v);
		setVal("dFeels", num(w.feels) ? Math.round(w.feels) + "\u00B0" : "--");
		setVal("dHum", num(w.hum) ? Math.round(w.hum) + "%" : "--");
		setVal("dWind", num(w.wind) ? String(Math.round(w.wind)) : "--", num(w.wind) ? (w.mph ? "mph" : "km/h") : "");
		const r = fmtClock(w.sunrise), s = fmtClock(w.sunset);
		setVal("dRise", r[0], r[1]); setVal("dSet", s[0], s[1]);
		fitLabels();
	}

	/* اللمس: ضغطة تفتح تفاصيل الطقس وضغطة أخرى ترجع لشاشة الوقت */
	let showingDetails = false, lastTap = 0, detailsTimer = null;
	function setDetails(show) {
		clearTimeout(detailsTimer);
		detailsTimer = null;
		showingDetails = show;
		if (show) {
			renderDetails();
			/* الرجوع تلقائيًا لشاشة الوقت بعد المدة المختارة (0 = بدون رجوع تلقائي) */
			let secs = parseInt(String(prop("detailsTime", "10")), 10);
			if (!isFinite(secs) || secs < 0) secs = 10;
			if (secs > 0) detailsTimer = setTimeout(function () { setDetails(false); }, Math.min(secs, 600) * 1000);
		}
		$("layout").classList.toggle("show-details", show);
		$("details").setAttribute("aria-hidden", show ? "false" : "true");
		fitKey = "";
		fitLabels();
		if (!show) fitDate();
	}
	function toggleDetails() {
		const now = Date.now();
		if (now - lastTap < 350) return;
		lastTap = now;
		setDetails(!showingDetails);
	}
	document.addEventListener("click", toggleDetails);

	function fitLabels() {
		document.querySelectorAll(".cell .lbl, .dlbl").forEach(function (el) {
			el.style.fontSize = "";
			el.style.direction = IS_RTL ? "rtl" : "ltr";
			const room = el.parentElement.clientWidth - 8;
			const w = el.scrollWidth;
			if (room > 0 && w > room) el.style.fontSize = (parseFloat(getComputedStyle(el).fontSize) * room / w) + "px";
		});
		document.querySelectorAll(".dval").forEach(function (el) {
			el.style.fontSize = "";
			const room = el.parentElement.clientWidth - 8;
			const w = el.scrollWidth;
			if (room > 0 && w > room) el.style.fontSize = (parseFloat(getComputedStyle(el).fontSize) * room / w) + "px";
		});
	}
	window.addEventListener("resize", fitLabels);

	function render(stale) {
		document.querySelectorAll(".cell").forEach(e => e.classList.toggle("stale", !!stale));
		if (!wx) {
			$("wxIcon").innerHTML = weatherIcon(3, true); $("temp").textContent = "--°"; $("dn").textContent = "--";
			$("rainIcon").innerHTML = dropIcon(0); $("rainPct").textContent = "--%"; $("rainLbl").textContent = L[2]; fitLabels();
			return;
		}
		$("wxIcon").innerHTML = weatherIcon(wx.code, wx.isDay);
		$("temp").textContent = Math.round(wx.temp) + "°";
		$("dn").textContent = wx.isDay ? L[0] : L[1];
		$("rainIcon").innerHTML = dropIcon(wx.rainNow ? 100 : wx.prob);
		$("rainPct").textContent = wx.prob + "%";
		$("rainLbl").textContent = wx.rainNow ? L[3] : L[2];
		fitLabels();
		if (showingDetails) renderDetails();
	}

	function dayVal(daily, key, day) {
		if (!daily || !Array.isArray(daily.time) || !Array.isArray(daily[key])) return "";
		let i = daily.time.indexOf(day);
		if (i < 0) i = 0;
		return daily[key][i] || "";
	}

	let reqId = 0, ctlCurrent = null;
	async function refreshWeather() {
		const my = ++reqId;
		clearTimeout(timer);
		timer = setTimeout(refreshWeather, 15 * 60 * 1000);
		if (ctlCurrent) ctlCurrent.abort();
		const ctl = ctlCurrent = new AbortController();
		const to = setTimeout(() => ctl.abort(), 12000);
		const fahrenheit = String(prop("tempUnit", "C")).indexOf("F") >= 0;
		try {
			const locId = prop("weatherLocation", "");
			const [lat, lon] = await resolveLocation(locId);
			if (my !== reqId) return;
			showCity(locId);
			const url = "https://api.open-meteo.com/v1/forecast?latitude=" + encodeURIComponent(lat) + "&longitude=" + encodeURIComponent(lon) +
				"&current=temperature_2m,is_day,weather_code,relative_humidity_2m,apparent_temperature,wind_speed_10m&hourly=precipitation_probability&daily=sunrise,sunset&forecast_days=2&timezone=auto" +
				(fahrenheit ? "&temperature_unit=fahrenheit&wind_speed_unit=mph" : "");
			const r = await fetch(url, { signal: ctl.signal });
			if (!r.ok) throw new Error("HTTP " + r.status);
			const j = await r.json();
			if (my !== reqId) return;
			const cur = j.current, hr = j.hourly;
			if (!cur || typeof cur.temperature_2m !== "number" || !hr || !Array.isArray(hr.time)) throw new Error("bad data");
			const nowHour = String(cur.time).slice(0, 13);
			let i = hr.time.findIndex(t => String(t).slice(0, 13) >= nowHour);
			if (i < 0) i = 0;
			const next = (hr.precipitation_probability || []).slice(i, i + 3).filter(v => typeof v === "number");
			wx = {
				temp: cur.temperature_2m, isDay: !!cur.is_day, code: Number(cur.weather_code),
				prob: next.length ? Math.max.apply(null, next) : 0,
				rainNow: RAIN_CODES(Number(cur.weather_code)),
				feels: cur.apparent_temperature, hum: cur.relative_humidity_2m, wind: cur.wind_speed_10m, mph: fahrenheit,
				sunrise: dayVal(j.daily, "sunrise", String(cur.time).slice(0, 10)),
				sunset: dayVal(j.daily, "sunset", String(cur.time).slice(0, 10))
			};
			render(false);
		} catch (e) {
			if (my !== reqId) return;           // superseded by a newer request
			render(true);                       // keep the last good reading, mark as offline
			clearTimeout(timer);
			timer = setTimeout(refreshWeather, 60 * 1000);
		} finally {
			clearTimeout(to);
		}
	}

	let started = false;
	function init() {
		if (started) { applySettings(); return; }
		started = true;
		render(false);
		applySettings();
		tick();
	}

	/* معاينة خارج iCUE (للاختبار في المتصفح) */
	if (typeof iCUE_initialized !== "undefined" && iCUE_initialized) init();
	else if (typeof iCUE_initialized === "undefined") window.addEventListener("load", () => setTimeout(init, 0));
})();
