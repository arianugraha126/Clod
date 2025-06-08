document.addEventListener('DOMContentLoaded', function () {
    // ==================================================================
    // PENTING: GANTI DENGAN API KEY ANDA YANG VALID
    // ==================================================================
    const apiKey = '5d67b1d53bcc54d990ad80eed632ba21';
    
    const baseUrlApi = 'https://api.openweathermap.org/data/2.5/';

    // Referensi Elemen HTML
    const inputKota = document.getElementById('input-kota');
    const tombolCari = document.getElementById('tombol-cari');
    const tombolLokasiSaya = document.getElementById('tombol-lokasi-saya');
    const currentWeatherContentDiv = document.getElementById('current-weather-content');
    const forecastContentDiv = document.getElementById('forecast-content');
    const autocompleteResultsDiv = document.getElementById('autocomplete-results');
    const aqiCardWrapper = document.getElementById('aqi-card-wrapper');
    const aqiContentDiv = document.getElementById('aqi-content');

    let map;
    let markersLayerGroup = L.markerClusterGroup();
    let activeWeatherMarker = null;
    let allCities = [];
    // Deklarasikan variabel layer di scope yang lebih luas
    let osmLayer, cartoDBDarkMatter, cloudLayer, precipitationLayer, temperatureLayer;

    // Inisialisasi Peta Leaflet
    function initMap() {
        // Hapus kontrol zoom default agar kita bisa atur posisinya
        map = L.map('map', { zoomControl: false }).setView([-2.5, 118.0], 5);
        // Tambahkan kembali kontrol zoom di posisi kiri atas
        L.control.zoom({ position: 'topleft' }).addTo(map);

        // Definisi Semua Layer
        osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors' });
        cartoDBDarkMatter = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { attribution: '&copy; OpenStreetMap contributors &copy; CARTO' });
        
        cloudLayer = L.tileLayer(`https://tile.openweathermap.org/map/clouds_new/{z}/{x}/{y}.png?appid=${apiKey}`, { attribution: 'OpenWeatherMap Clouds', opacity: 0.7 });
        precipitationLayer = L.tileLayer(`https://tile.openweathermap.org/map/precipitation_new/{z}/{x}/{y}.png?appid=${apiKey}`, { attribution: 'OpenWeatherMap Precipitation', opacity: 0.7 });
        temperatureLayer = L.tileLayer(`https://tile.openweathermap.org/map/temp_new/{z}/{x}/{y}.png?appid=${apiKey}`, { attribution: 'OpenWeatherMap Temperature', opacity: 0.6 });
        
        // Atur peta dasar & overlay default saat pertama kali dimuat
        osmLayer.addTo(map);
        markersLayerGroup.addTo(map);
        
        // Panggil fungsi untuk setup event listener kontrol kustom
        setupCustomControls();
        loadAllIndonesianCities();
    }

    // Fungsi untuk mengatur kontrol peta kustom yang baru
    function setupCustomControls() {
        const layerButtons = document.querySelectorAll('.layer-btn');
        const basemapButtons = document.querySelectorAll('.basemap-btn');
        const legendContainer = document.getElementById('custom-legend-container');
        
        layerButtons.forEach(button => {
            button.addEventListener('click', function() {
                layerButtons.forEach(btn => btn.classList.remove('active'));
                this.classList.add('active');

                // Hapus semua lapisan overlay cuaca
                map.removeLayer(temperatureLayer);
                map.removeLayer(precipitationLayer);
                map.removeLayer(cloudLayer);
                map.removeLayer(markersLayerGroup);
                legendContainer.innerHTML = ''; // Kosongkan legenda

                // Tambahkan lapisan yang sesuai
                const layerType = this.dataset.layer;
                switch(layerType) {
                    case 'temperature':
                        map.addLayer(temperatureLayer);
                        legendContainer.innerHTML = createLegendHTML(); // Tampilkan legenda
                        break;
                    case 'precipitation':
                        map.addLayer(precipitationLayer);
                        break;
                    case 'clouds':
                        map.addLayer(cloudLayer);
                        break;
                    case 'cities':
                        map.addLayer(markersLayerGroup);
                        break;
                }
            });
        });

        basemapButtons.forEach(button => {
            button.addEventListener('click', function() {
                basemapButtons.forEach(btn => btn.classList.remove('active'));
                this.classList.add('active');

                map.removeLayer(osmLayer);
                map.removeLayer(cartoDBDarkMatter);

                if (this.dataset.basemap === 'dark') {
                    map.addLayer(cartoDBDarkMatter);
                } else {
                    map.addLayer(osmLayer);
                }
            });
        });
    }

    // Fungsi untuk membuat HTML legenda
    function createLegendHTML() {
        const grades = [-40, -20, 0, 10, 20, 30, 40];
        const colors = ['#000080', '#0000FF', '#00FFFF', '#00FF00', '#FFFF00', '#FFA500', '#FF0000'];
        let legendHtml = '<div class="info legend"><h4>Suhu (°C)</h4>';
        for (let i = 0; i < grades.length; i++) {
            legendHtml += `<i style="background:${colors[i]}"></i> ${grades[i]}${grades[i + 1] ? '&ndash;' + grades[i + 1] + '<br>' : '+'}`;
        }
        legendHtml += '</div>';
        return legendHtml;
    }
    
    // Semua fungsi lain di bawah ini tetap sama persis seperti sebelumnya
    async function loadAllIndonesianCities() {
        try {
            const response = await fetch('data/kota_indonesia.json');
            if (!response.ok) throw new Error('Gagal memuat daftar kota.');
            allCities = await response.json();
            
            allCities.forEach(city => {
                if (city.lat && city.lon) {
                    const initialMarker = L.marker([city.lat, city.lon], { title: city.name });
                    initialMarker.bindPopup(`<b>${city.name}</b><br>Klik untuk info cuaca...`);
                    initialMarker.on('click', () => window.showCityDetailsFromMarker(city.name, city.lat, city.lon));
                    markersLayerGroup.addLayer(initialMarker);
                }
            });
        } catch (error) { console.error('Error memuat daftar kota:', error); }
    }

    async function fetchAllData(lat, lon, cityName) {
        currentWeatherContentDiv.innerHTML = `<p><i class="fas fa-spinner fa-spin"></i> Memuat data cuaca...</p>`;
        forecastContentDiv.innerHTML = `<p><i class="fas fa-spinner fa-spin"></i> Memuat data prakiraan...</p>`;
        aqiCardWrapper.classList.add('hidden');
        try {
            const weatherPromise = fetch(`${baseUrlApi}weather?${lat ? `lat=${lat}&lon=${lon}` : `q=${encodeURIComponent(cityName)},ID`}&appid=${apiKey}&units=metric&lang=id`).then(res => { if (!res.ok) throw new Error('Kota tidak ditemukan'); return res.json(); });
            const weatherData = await weatherPromise;
            const finalLat = weatherData.coord.lat;
            const finalLon = weatherData.coord.lon;
            if (!cityName) { inputKota.value = weatherData.name; }
            const forecastPromise = fetch(`${baseUrlApi}forecast?lat=${finalLat}&lon=${finalLon}&appid=${apiKey}&units=metric&lang=id`).then(res => res.json());
            const aqiPromise = fetch(`${baseUrlApi}air_pollution?lat=${finalLat}&lon=${finalLon}&appid=${apiKey}`).then(res => res.json());
            const [forecastData, aqiData] = await Promise.all([forecastPromise, aqiPromise]);
            displayCurrentWeather(weatherData);
            displayForecast(forecastData);
            if (aqiData.list && aqiData.list.length > 0) { displayAirQuality(aqiData.list[0]); }
            if (activeWeatherMarker) { markersLayerGroup.removeLayer(activeWeatherMarker); }
            activeWeatherMarker = addCustomWeatherMarker(weatherData);
            map.setView([finalLat, finalLon], 11);
        } catch (error) {
            console.error('Error fetching weather data:', error);
            currentWeatherContentDiv.innerHTML = `<p style="color: #e74c3c;"><i class="fas fa-exclamation-triangle"></i> Error: ${error.message}</p>`;
            forecastContentDiv.innerHTML = `<p style="color: #e74c3c;">Gagal memuat.</p>`;
            aqiCardWrapper.classList.add('hidden');
        }
    }

    function displayCurrentWeather(data) {
        const iconUrl = `https://openweathermap.org/img/wn/${data.weather[0].icon}@4x.png`;
        const formattedDate = new Date(data.dt * 1000).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        const weatherHtml = `<h3 class="city-name">${data.name}, ${data.sys.country}</h3><p class="current-date">${formattedDate}</p><div class="weather-main-display"><img src="${iconUrl}" alt="${data.weather[0].description}" class="weather-icon-large"><div class="temp-display"><span class="temp-big">${data.main.temp.toFixed(1)}°C</span><span class="condition">${data.weather[0].description}</span></div></div><div class="weather-details-grid"><div class="detail-item" title="Terasa Seperti"><i class="fas fa-temperature-half"></i><span class="detail-value">${data.main.feels_like.toFixed(1)}°C</span></div><div class="detail-item" title="Kelembapan"><i class="fas fa-tint"></i><span class="detail-value">${data.main.humidity}%</span></div><div class="detail-item" title="Angin"><i class="fas fa-wind"></i><span class="detail-value">${data.wind.speed} m/s</span></div><div class="detail-item" title="Tekanan Udara"><i class="fas fa-tachometer-alt"></i><span class="detail-value">${data.main.pressure} hPa</span></div><div class="detail-item" title="Matahari Terbit"><i class="fas fa-sun"></i><span class="detail-value">${new Date(data.sys.sunrise * 1000).toLocaleTimeString('id-ID', {hour: '2-digit', minute:'2-digit'})}</span></div><div class="detail-item" title="Matahari Terbenam"><i class="fas fa-moon"></i><span class="detail-value">${new Date(data.sys.sunset * 1000).toLocaleTimeString('id-ID', {hour: '2-digit', minute:'2-digit'})}</span></div></div>`;
        currentWeatherContentDiv.innerHTML = weatherHtml;
    }

    function displayForecast(forecastData) {
        let forecastHtml = '';
        const dailyData = {};
        if (forecastData.cod === "200") {
            forecastData.list.forEach(item => { const date = new Date(item.dt * 1000).toISOString().split('T')[0]; if (!dailyData[date]) { dailyData[date] = item; } });
            let count = 0;
            for (const dateKey in dailyData) {
                if (count >= 5) break;
                const item = dailyData[dateKey];
                const dateObj = new Date(item.dt * 1000);
                const dayName = dateObj.toLocaleDateString('id-ID', { weekday: 'long' });
                const shortDate = dateObj.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
                const iconUrl = `https://openweathermap.org/img/wn/${item.weather[0].icon}@2x.png`;
                forecastHtml += `<div class="forecast-item"><div class="day-info"><strong>${dayName}</strong><span>${shortDate}</span></div><img src="${iconUrl}" alt="${item.weather[0].description}" class="forecast-icon-small"><span class="forecast-temp">${item.main.temp.toFixed(1)}°C</span></div>`;
                count++;
            }
        }
        forecastContentDiv.innerHTML = forecastHtml || "<p>Prakiraan tidak tersedia.</p>";
    }

    function displayAirQuality(data) {
        aqiCardWrapper.classList.remove('hidden');
        const aqi = data.main.aqi;
        let statusText = '', statusClass = '';
        switch (aqi) {
            case 1: statusText = 'Baik'; statusClass = 'status-good'; break;
            case 2: statusText = 'Cukup'; statusClass = 'status-good'; break;
            case 3: statusText = 'Sedang'; statusClass = 'status-moderate'; break;
            case 4: statusText = 'Buruk'; statusClass = 'status-poor'; break;
            case 5: statusText = 'Sangat Buruk'; statusClass = 'status-poor'; break;
        }
        const aqiHtml = `<div class="aqi-main"><i class="fas fa-smog"></i><div class="aqi-summary"><span class="aqi-value-text">${aqi}</span><span class="aqi-status-tag ${statusClass}">${statusText}</span></div></div><div class="aqi-details"><div class="pollutant-item"><span class="pollutant-label">PM2.5</span><strong class="pollutant-value">${data.components.pm2_5.toFixed(2)} µg/m³</strong></div><div class="pollutant-item"><span class="pollutant-label">SO₂</span><strong class="pollutant-value">${data.components.so2.toFixed(2)} µg/m³</strong></div><div class="pollutant-item"><span class="pollutant-label">NO₂</span><strong class="pollutant-value">${data.components.no2.toFixed(2)} µg/m³</strong></div><div class="pollutant-item"><span class="pollutant-label">O₃</span><strong class="pollutant-value">${data.components.o3.toFixed(2)} µg/m³</strong></div></div>`;
        aqiContentDiv.innerHTML = aqiHtml;
    }

    function addCustomWeatherMarker(data) {
        if (!map || !data || !data.coord) return null;
        const marker = L.marker([data.coord.lat, data.coord.lon], { title: data.name, zIndexOffset: 1000 });
        marker.bindPopup(`<b>${data.name}</b><br>${data.main.temp.toFixed(1)}°C, ${data.weather[0].description}`).openPopup();
        markersLayerGroup.addLayer(marker);
        return marker;
    }
    
    window.showCityDetailsFromMarker = function(cityName, lat, lon) {
        const dataSection = document.getElementById('interactive-section');
        if (dataSection) { fetchAllData(lat, lon, cityName); }
    }

    function showAutocomplete(matches) {
        if (!matches.length) { autocompleteResultsDiv.style.display = 'none'; return; }
        let itemsHtml = matches.slice(0, 6).map(match => `<div data-lat="${match.lat}" data-lon="${match.lon}" data-name="${match.name}">${match.name}</div>`).join('');
        autocompleteResultsDiv.innerHTML = itemsHtml;
        autocompleteResultsDiv.style.display = 'block';
        document.querySelectorAll('#autocomplete-results div').forEach(item => {
            item.addEventListener('click', function() {
                fetchAllData(this.dataset.lat, this.dataset.lon, this.dataset.name);
                inputKota.value = this.dataset.name;
                autocompleteResultsDiv.style.display = 'none';
            });
        });
    }

    inputKota.addEventListener('input', function() {
        const query = this.value.toLowerCase();
        if (query.length < 2) { autocompleteResultsDiv.style.display = 'none'; return; }
        const matches = allCities.filter(city => city.name.toLowerCase().includes(query));
        showAutocomplete(matches);
    });
    
    document.addEventListener('click', (e) => { if (!e.target.closest('.autocomplete-container')) { autocompleteResultsDiv.style.display = 'none'; } });
    
    tombolCari.addEventListener('click', () => {
        const namaKota = inputKota.value.trim();
        if (namaKota) {
            const foundCity = allCities.find(city => city.name.toLowerCase() === namaKota.toLowerCase());
            if (foundCity) { fetchAllData(foundCity.lat, foundCity.lon, foundCity.name); } 
            else { fetchAllData(null, null, namaKota); }
        }
    });

    inputKota.addEventListener('keypress', (e) => { if (e.key === 'Enter') tombolCari.click(); });

    tombolLokasiSaya.addEventListener('click', () => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => fetchAllData(position.coords.latitude, position.coords.longitude, null),
                (error) => alert(`Tidak dapat mengambil lokasi Anda: ${error.message}`)
            );
        } else { alert("Geolokasi tidak didukung oleh browser ini."); }
    });

    if (document.getElementById('map')) {
        initMap();
    }
});