// assets/js/app.js
(() => {
    "use strict";

    // -------------------------------
    // Selectores base
    // -------------------------------
    const dropdownButton = document.getElementById("units-button");
    const dropdownMenu = document.getElementById("units-menu");
    const menuItems = document.querySelectorAll("#units-menu .menu__item");
    const systemToggleButton = document.querySelector('[data-action="toggle-system"]');

    const dropdownHourlyButton = document.getElementById("hourly-button");
    const hourlyMenu = document.getElementById("day-menu");
    const hourlyItems = hourlyMenu.querySelectorAll(".menu__item");
    const hourlyLabel = dropdownHourlyButton.querySelector("span");

    const queryInput = document.getElementById("query");
    const resultsContainer = document.getElementById("search-results");
    const searchButton = document.getElementById("search-button");

    const weatherSection = document.getElementById("weather");
    const sidebar = document.getElementById("sidebar");
    const mainCard = document.querySelector(".weather__main");
    const detailsEl = document.querySelector(".weather__details");
    const dailyWrap = document.querySelector(".forecast__content");
    const hourlyWrap = document.querySelector(".sidebar__content");

    // -------------------------------
    // Estado persistente
    // -------------------------------
    const savedSelections =
        JSON.parse(localStorage.getItem("unitSelections")) || {
            temp: "c",
            wind: "kmh",
            precip: "mm",
        };

    let lastCoords = null;
    let lastForecast = null;
    let selectedCity = null;

    const todayWeekday = new Intl.DateTimeFormat(undefined, { weekday: "long" })
        .format(new Date())
        .toLowerCase();

    const savedDay = (localStorage.getItem("hourlySelectedDay") || todayWeekday).toLowerCase();

    // -------------------------------
    // Utilidades
    // -------------------------------
    const $ = (sel, p = document) => p.querySelector(sel);
    const $$ = (sel, p = document) => [...p.querySelectorAll(sel)];
    const cap = (s) => s && s[0].toUpperCase() + s.slice(1);
    const k = (n) => (typeof n === "number" ? Math.round(n) : "-");

    const setBusy = (el, busy) => {
        el.setAttribute("aria-busy", busy ? "true" : "false");
        el.classList.toggle("skeleton", busy);
        if (busy) {
            hourlyWrap.innerHTML = "";
            dailyWrap.innerHTML = "";
        }
    };

    const toggleResultsVisibility = (show) => {
        resultsContainer.style.display = show ? "flex" : "none";
    };

    const iconFor = (wmo, isDay = 1) => {
        if (wmo === 0) return "icon-sunny.webp";
        if ([1, 2].includes(wmo)) return "icon-partly-cloudy.webp";
        if (wmo === 3) return "icon-overcast.webp";
        if ([45, 48].includes(wmo)) return "icon-fog.webp";
        if ([51, 53, 55, 56, 57].includes(wmo)) return "icon-drizzle.webp";
        if ([61, 63, 65, 80, 81, 82].includes(wmo)) return "icon-rain.webp";
        if ([66, 67, 71, 73, 75, 77, 85, 86].includes(wmo)) return "icon-snow.webp";
        if ([95, 96, 99].includes(wmo)) return "icon-storm.webp";
        return isDay ? "icon-partly-cloudy.webp" : "icon-overcast.webp";
    };

    const apiUnits = () => ({
        temperature_unit: savedSelections.temp === "c" ? "celsius" : "fahrenheit",
        windspeed_unit: savedSelections.wind === "kmh" ? "kmh" : "mph",
        precipitation_unit: savedSelections.precip === "mm" ? "mm" : "inch",
    });

    const showUnits = {
        temp: () => (savedSelections.temp === "c" ? "°C" : "°F"),
        wind: () => (savedSelections.wind === "kmh" ? "km/h" : "mph"),
        precip: () => (savedSelections.precip === "mm" ? "mm" : "in"),
    };

    const fmtTime = (iso, tz) =>
        new Intl.DateTimeFormat(undefined, {
            hour: "numeric",
            minute: undefined,
            hour12: true,
            timeZone: tz,
        }).format(new Date(iso));

    const fmtDayShort = (iso, tz) =>
        new Intl.DateTimeFormat(undefined, { weekday: "short", timeZone: tz }).format(new Date(iso));

    const fmtDateLong = (iso, tz) =>
        new Intl.DateTimeFormat(undefined, {
            weekday: "long",
            year: "numeric",
            month: "short",
            day: "numeric",
            timeZone: tz,
        }).format(new Date(iso));

    // -------------------------------
    // Render principales
    // -------------------------------
    const renderMainCard = (place, current) => {
        mainCard.classList.remove("skeleton");
        mainCard.innerHTML = `
      <div class="weather__location">
        <h2>${place.name}, ${place.country}</h2>
        <p>${fmtDateLong(new Date().toISOString(), place.timezone)}</p>
      </div>
      <div class="weather__now">
        <img class="weather__icon" src="assets/images/${iconFor(
            current.weather_code,
            current.is_day
        )}" alt="" />
        <p class="weather__temp">${k(current.temperature_2m)}${showUnits.temp()}</p>
      </div>`;
    };

    const renderDetails = (c) => {
        $(".detail-feels", detailsEl).textContent = `${k(c.apparent_temperature)}${showUnits.temp()}`;
        $(".detail-humidity", detailsEl).textContent = `${k(c.relative_humidity_2m)}%`;
        $(".detail-wind", detailsEl).textContent = `${k(c.windspeed_10m)} ${showUnits.wind()}`;
        $(".detail-precipitation", detailsEl).textContent = `${k(c.precipitation)} ${showUnits.precip()}`;
        $$(".detail", detailsEl).forEach((d) => d.classList.remove("skeleton-box"));
    };

    const renderDaily = (daily, tz) => {
        dailyWrap.innerHTML = "";
        for (let i = 0; i < Math.min(daily.time.length, 7); i++) {
            const el = document.createElement("div");
            el.className = "forecast-item";
            el.innerHTML = `
        <p class="forecast-item__day">${fmtDayShort(daily.time[i], tz)}</p>
        <img src="assets/images/${iconFor(daily.weather_code[i], 1)}" alt="" />
        <div class="forecast-item__temps">
          <span>${k(daily.temperature_2m_max[i])}${showUnits.temp()}</span>
          <span>${k(daily.temperature_2m_min[i])}${showUnits.temp()}</span>
        </div>`;
            dailyWrap.appendChild(el);
        }
    };

    const makeHourlyItem = (label, idx, hourly, tz) => {
        const el = document.createElement("div");
        el.className = "hourly__item";
        el.innerHTML = `
      <div class="hourly__left">
        <img src="assets/images/${iconFor(hourly.weather_code[idx], 1)}" alt="" />
        <p>${label}</p>
      </div>
      <div class="hourly__right">
        <span>${k(hourly.temperature_2m[idx])}${showUnits.temp()}</span>
      </div>`;
        return el;
    };

    const renderHourly = (hourly, tz) => {
        hourlyWrap.innerHTML = "";

        const now = new Date();
        const tzNow = new Date(now.toLocaleString("en-US", { timeZone: tz }));

        let startIdx = hourly.time.findIndex((t) => new Date(t) >= tzNow);
        if (startIdx < 0) startIdx = 0;

        hourlyWrap.appendChild(makeHourlyItem("Now", startIdx, hourly, tz));

        for (let i = startIdx + 1; i < hourly.time.length && i < startIdx + 8; i++) {
            const label = fmtTime(hourly.time[i], tz);
            hourlyWrap.appendChild(makeHourlyItem(label, i, hourly, tz));
        }

        sidebar.classList.remove("skeleton");
    };

    // -------------------------------
    // Fetch
    // -------------------------------
    const fetchForecast = async (lat, lon, tz) => {
        const u = apiUnits();
        const params = new URLSearchParams({
            latitude: lat,
            longitude: lon,
            timezone: tz || "auto",
            current:
                "temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,windspeed_10m,is_day",
            hourly: "temperature_2m,precipitation,weather_code",
            daily: "weather_code,temperature_2m_max,temperature_2m_min",
            ...u,
        });
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
        return res.json();
    };

    // -------------------------------
    // Búsqueda: loader + highlight
    // -------------------------------
    const highlightText = (text) => {
        const q = queryInput.value.trim();
        if (!q) return text;
        const rx = new RegExp(`(${q})`, "gi");
        return text.replace(rx, '<span class="highlight">$1</span>');
    };

    const fetchCities = async (query) => {
        if (!query || query.length < 3) {
            toggleResultsVisibility(false);
            return;
        }

        resultsContainer.innerHTML = `
      <div class="loading">
        <i class="fi fi-rr-spinner"></i>
        <p>Search in progress</p>
      </div>`;
        toggleResultsVisibility(true);

        try {
            const res = await fetch(
                `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
                    query
                )}&language=en&count=8&format=json`
            );
            const data = await res.json();

            if (!data?.results?.length) {
                resultsContainer.innerHTML = `<div class="loading"><p>No results found</p></div>`;
                return;
            }

            resultsContainer.innerHTML = "";
            data.results.forEach((city) => {
                const el = document.createElement("div");
                el.className = "result-item";
                el.innerHTML = `${highlightText(city.name)}, ${highlightText(city.country)}`;
                el.onclick = () => {
                    selectedCity = city;
                    queryInput.value = `${city.name}, ${city.country}`;
                    toggleResultsVisibility(false);
                };
                resultsContainer.appendChild(el);
            });
            toggleResultsVisibility(true);
        } catch (err) {
            console.error(err);
            resultsContainer.innerHTML = `<div class="loading"><p>Error fetching data</p></div>`;
        }
    };

    queryInput.addEventListener("input", (e) => {
        const q = e.target.value.trim();
        fetchCities(q);
    });

    searchButton.addEventListener("click", async () => {
        if (!selectedCity) return;
        const { latitude: lat, longitude: lon, name, country, timezone } = selectedCity;
        setBusy(weatherSection, true);
        setBusy(sidebar, true);
        const forecast = await fetchForecast(lat, lon, timezone);
        renderAll(selectedCity, forecast);
        localStorage.setItem("lastLocation", JSON.stringify(selectedCity));
        queryInput.value = "";
    });

    // -------------------------------
    // Render general
    // -------------------------------
    const renderAll = (place, forecast) => {
        lastCoords = place;
        lastForecast = forecast;
        renderMainCard(place, forecast.current);
        renderDetails(forecast.current);
        renderDaily(forecast.daily, forecast.timezone);
        renderHourly(forecast.hourly, forecast.timezone);
        setBusy(weatherSection, false);
        setBusy(sidebar, false);
    };

    // -------------------------------
    // Dropdowns y unidades
    // -------------------------------
    const setSelectedUnits = () => {
        menuItems.forEach((item) => {
            const key = item.getAttribute("data-key");
            const value = item.getAttribute("data-value");
            const isSelected = savedSelections[key] === value;
            item.classList.toggle("selected", isSelected);
            item.setAttribute("aria-checked", isSelected ? "true" : "false");
            const icon = item.querySelector("i");
            if (icon) icon.classList.toggle("fi-rr-check", isSelected);
        });
    };

    const updateSystemButtonText = () => {
        const currentSystem = savedSelections.temp === "c" ? "metric" : "imperial";
        systemToggleButton.textContent =
            currentSystem === "imperial" ? "Switch to Metric" : "Switch to Imperial";
    };

    const handleSelectionChange = async (e) => {
        const item = e.target.closest(".menu__item");
        if (!item) return;
        const key = item.getAttribute("data-key");
        const value = item.getAttribute("data-value");
        savedSelections[key] = value;
        localStorage.setItem("unitSelections", JSON.stringify(savedSelections));
        setSelectedUnits();
        updateSystemButtonText();

        if (lastCoords) {
            setBusy(weatherSection, true);
            setBusy(sidebar, true);
            const forecast = await fetchForecast(
                lastCoords.latitude || lastCoords.lat,
                lastCoords.longitude || lastCoords.lon,
                lastCoords.timezone
            );
            renderAll(lastCoords, forecast);
        }
    };

    const toggleSystem = async () => {
        const metric = savedSelections.temp === "c";
        savedSelections.temp = metric ? "f" : "c";
        savedSelections.wind = metric ? "mph" : "kmh";
        savedSelections.precip = metric ? "in" : "mm";
        localStorage.setItem("unitSelections", JSON.stringify(savedSelections));
        setSelectedUnits();
        updateSystemButtonText();

        if (lastCoords) {
            setBusy(weatherSection, true);
            setBusy(sidebar, true);
            const forecast = await fetchForecast(
                lastCoords.latitude || lastCoords.lat,
                lastCoords.longitude || lastCoords.lon,
                lastCoords.timezone
            );
            renderAll(lastCoords, forecast);
        }
    };

    const toggleMenuUnits = () => {
        const expanded = dropdownButton.getAttribute("aria-expanded") === "true";
        dropdownButton.setAttribute("aria-expanded", (!expanded).toString());
        dropdownMenu.style.display = expanded ? "none" : "flex";
    };

    const setDaySelected = (dayValue) => {
        const normalized = (dayValue || "").toLowerCase();
        hourlyItems.forEach((it) => {
            const isHit = it.dataset.value === normalized;
            it.setAttribute("aria-checked", isHit ? "true" : "false");
            it.classList.toggle("selected", isHit);
        });
        hourlyLabel.textContent = cap(normalized);
        localStorage.setItem("hourlySelectedDay", normalized);

        if (lastForecast) renderHourly(lastForecast.hourly, lastForecast.timezone);
    };

    const handleDaySelection = (e) => {
        const item = e.target.closest(".menu__item");
        if (!item) return;
        const day = (item.dataset.value || "").toLowerCase();
        setDaySelected(day);
        dropdownHourlyButton.setAttribute("aria-expanded", "false");
        hourlyMenu.style.display = "none";
    };

    const toggleMenuHourly = () => {
        const expanded = dropdownHourlyButton.getAttribute("aria-expanded") === "true";
        dropdownHourlyButton.setAttribute("aria-expanded", (!expanded).toString());
        hourlyMenu.style.display = expanded ? "none" : "flex";
    };

    const closeOnOutsideClick = (e) => {
        if (!dropdownButton.contains(e.target) && !dropdownMenu.contains(e.target)) {
            dropdownButton.setAttribute("aria-expanded", "false");
            dropdownMenu.style.display = "none";
        }
        if (!dropdownHourlyButton.contains(e.target) && !hourlyMenu.contains(e.target)) {
            dropdownHourlyButton.setAttribute("aria-expanded", "false");
            hourlyMenu.style.display = "none";
        }
        if (!resultsContainer.contains(e.target) && e.target !== queryInput) {
            toggleResultsVisibility(false);
        }
    };

    // -------------------------------
    // Eventos UI
    // -------------------------------
    dropdownButton.addEventListener("click", toggleMenuUnits);
    systemToggleButton.addEventListener("click", toggleSystem);
    menuItems.forEach((item) => item.addEventListener("click", handleSelectionChange));

    dropdownHourlyButton.addEventListener("click", toggleMenuHourly);
    hourlyItems.forEach((item) => item.addEventListener("click", handleDaySelection));

    document.addEventListener("click", closeOnOutsideClick);

    // -------------------------------
    // Init
    // -------------------------------
    const boot = async () => {
        setSelectedUnits();
        updateSystemButtonText();
        setDaySelected(savedDay);

        const saved = JSON.parse(localStorage.getItem("lastLocation"));
        if (saved?.latitude && saved?.longitude) {
            setBusy(weatherSection, true);
            setBusy(sidebar, true);
            const forecast = await fetchForecast(saved.latitude, saved.longitude, saved.timezone);
            renderAll(saved, forecast);
        }
    };

    boot();
})();
