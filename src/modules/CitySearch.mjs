// Clock and Weather widget - Developer: Nawaf AlMutairi | https://Nawaf-Blog.com/NM
// City search for the widget settings (Open-Meteo geocoding).
// Exposes getCities(query) and getDefaultCity() for the search-combobox control.

const TOTAL_TIMEOUT_MS = 9000;

function lang() {
    return (typeof iCUE !== "undefined" && iCUE.iCUELanguage) ? iCUE.iCUELanguage : "en";
}

function request(url, timeoutMs) {
    return new Promise(function (resolve) {
        const xhr = new XMLHttpRequest();
        let done = false;
        function finish(list) { if (!done) { done = true; resolve(list); } }
        if (timeoutMs <= 0) { finish([]); return; }
        xhr.open("GET", url, true);
        xhr.timeout = timeoutMs;
        xhr.onreadystatechange = function () {
            if (xhr.readyState !== 4) return;
            if (xhr.status !== 200) { finish([]); return; }
            try {
                const data = JSON.parse(xhr.responseText);
                finish(Array.isArray(data.results) ? data.results : []);
            } catch (e) { finish([]); }
        };
        xhr.onerror = function () { finish([]); };
        xhr.ontimeout = function () { finish([]); };
        xhr.send();
    });
}

function search(name, language, countryCode, timeoutMs) {
    if (!name || name.length < 2) return Promise.resolve([]);
    let url = "https://geocoding-api.open-meteo.com/v1/search?name=" + encodeURIComponent(name) +
        "&count=10&language=" + encodeURIComponent(language);
    if (countryCode) url += "&country=" + encodeURIComponent(countryCode);
    return request(url, timeoutMs);
}

function label(item) {
    let text = item.name || "";
    if (item.admin1 && item.admin1 !== item.name) text += ", " + item.admin1;
    if (item.country) text += ", " + item.country;
    return text;
}

export function getCities(query) {
    return search(query, lang(), null, TOTAL_TIMEOUT_MS).then(function (items) {
        return items.map(function (item) { return { key: item.id, value: label(item) }; });
    });
}

function distance(a, b) {
    return Math.abs(a.latitude - b.latitude) + Math.abs(a.longitude - b.longitude);
}

export function getDefaultCity() {
    const deadline = Date.now() + TOTAL_TIMEOUT_MS;
    return Promise.resolve()
        .then(function () {
            const raw = iCUE.defaultLocation(deadline - Date.now());
            if (!raw) throw new Error("no location");
            const here = JSON.parse(raw);
            return search(here.name, lang(), here.countryCode, deadline - Date.now()).then(function (items) {
                if (!items.length) throw new Error("no match");
                let best = items[0];
                for (let i = 1; i < items.length; i++) {
                    if (distance(here, items[i]) < distance(here, best)) best = items[i];
                }
                return [best.id, label(best)];
            });
        })
        .catch(function () {
            return [108410, "Riyadh, Saudi Arabia"];
        });
}
