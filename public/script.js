
async function fetchRecommendations(isAveragePrice) {
    const inputGroups = document.querySelectorAll('.input-group');
    const statusMessage = document.getElementById('status-message'); 

    const searchTerms = Array.from(inputGroups).map(group => {
        const categorySelect = group.querySelector('.category-select');
        const ddrSelect = group.querySelector('.ddr-select'); 
        const mhzSelect = group.querySelector('.mhz-select'); 
        const searchInput = group.querySelector('input[type="text"]');
        
        const category = ddrSelect && ddrSelect.value ? ddrSelect.value : (categorySelect ? categorySelect.value : '');
        const speed = mhzSelect && mhzSelect.value ? mhzSelect.value : ''; 
        const searchTerm = searchInput ? searchInput.value.trim() : '';
        
        return { category, speed, searchTerm }; 
    }).filter(item => item.searchTerm); // Filter out empty search terms

    if (searchTerms.length === 0) {
        statusMessage.textContent = 'Kérlek, adj meg legalább egy keresési kifejezést!'; 
        return;
    }

    try {
        const recommendationsDiv = document.getElementById('recommendations');

        statusMessage.textContent = ''; 
        recommendationsDiv.textContent = ''; 

        if (isAveragePrice) {
            await fetchAveragePrices(searchTerms);
        } else {
            await fetchListings(searchTerms); 
        }
    } catch (error) {
        console.error('Hiba történt az adatok lekérésekor:', error);
        statusMessage.textContent = 'Hiba történt az adatok lekérésekor. Kérlek, próbáld újra később.'; 
    }
}

async function fetchAveragePrices(searchTerms) {
    const statusMessage = document.getElementById('status-message');
    const recommendationsDiv = document.getElementById('recommendations');


    for (const { searchTerm } of searchTerms) {
        if (searchTerm.length < 3) {
            statusMessage.textContent = 'A kereséshez legalább 3 karakter szükséges!';
            return; // Stop the search if any term is too short
        }
    }

    statusMessage.innerHTML = 'Árak átlagának keresése...';

    try {
        // Send searchTerms as JSON to the server
        const response = await fetch('/average-price', {
            method: 'POST', 
            headers: {
                'Content-Type': 'application/json', 
            },
            body: JSON.stringify(searchTerms), 
        });

        // Handle non-OK responses
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Server error:', errorText);
            statusMessage.innerHTML = 'Hiba történt az átlagárak lekérésekor.';
            return;
        }

        const averagePrices = await response.json();

        // Check if the response is an array
        if (!Array.isArray(averagePrices)) {
            console.error('Unexpected server response:', averagePrices);
            statusMessage.innerHTML = 'Hiba történt az átlagárak feldolgozásakor.';
            return;
        }

        recommendationsDiv.innerHTML = '';

        if (averagePrices.length === 0) {
            recommendationsDiv.innerHTML = '<p>Nincs találat.</p>';
            statusMessage.innerHTML = 'Nincs találat.';
            return;
        }

        let totalPrice = 0;
        const list = document.createElement('ul');

        averagePrices.forEach(priceObj => {
            const { term, averagePrice } = priceObj;

            // Handle "Not found" case
            if (averagePrice === 0) {
                list.innerHTML += `<li><strong>${term}</strong>: Nincs találat</li>`;
            } else {
                totalPrice += averagePrice;
                list.innerHTML += `<li><strong>${term}</strong>: ${averagePrice.toFixed(0)} Ft</li>`;
            }
        });

        list.innerHTML += `<li><strong>Összesen:</strong> ${totalPrice.toFixed(0)} Ft</li>`;
        recommendationsDiv.appendChild(list);
        if (totalPrice === 0) {
            statusMessage.innerHTML = 'Nincs találat.';
        } else {
            statusMessage.innerHTML = 'Az átlagárak lekérdezése sikeres volt.';
        }
    } catch (error) {
        console.error('Hiba történt az átlagárak lekérésekor:', error);
        statusMessage.innerHTML = 'Hiba történt az átlagárak lekérésekor.';
    }
}

async function fetchListings(searchTerms) {
    const statusMessage = document.getElementById('status-message');
    const recommendationsDiv = document.getElementById('recommendations');
    const results = [];

    // Check if any search term is less than 3 characters
    for (const { searchTerm } of searchTerms) {
        if (searchTerm.length < 3) {
            statusMessage.textContent = 'A kereséshez legalább 3 karakter szükséges!';
            return; // Stop the search if any term is too short
        }
    }

    for (const { category, speed, searchTerm } of searchTerms) { 
        statusMessage.innerHTML = `Keresés folyamatban: "${searchTerm}" a(z) "${category}" kategóriában${speed ? ` (${speed} MHz)` : ''}... <span class="spinner"></span>`;
        try {
            const response = await fetch(`/search?category=${encodeURIComponent(category)}&q=${encodeURIComponent(searchTerm)}&speed=${encodeURIComponent(speed || '')}`); 
            const listings = await response.json();

            if (listings.length === 0) {
                statusMessage.innerHTML = `Nincs találat a(z) "${searchTerm}" kifejezésre a(z) "${category}" kategóriában${speed ? ` (${speed} MHz)` : ''}. Új adatok letöltése...`;
                const scrapeResponse = await fetch(`/scrape?category=${encodeURIComponent(category)}&q=${encodeURIComponent(searchTerm)}&speed=${encodeURIComponent(speed || '')}`); 
                const scrapeText = await scrapeResponse.text();

                if (scrapeText.includes('Scraping completed')) {
                    statusMessage.innerHTML = `A(z) "${searchTerm}" kifejezéshez új adatok lettek letöltve a(z) "${category}" kategóriában${speed ? ` (${speed} MHz)` : ''}.`;
                    const newResponse = await fetch(`/search?category=${encodeURIComponent(category)}&q=${encodeURIComponent(searchTerm)}&speed=${encodeURIComponent(speed || '')}`); 
                    const newListings = await newResponse.json();
                    results.push({ searchTerm, category, speed, listings: newListings });
                } else {
                    statusMessage.innerHTML = `Hiba történt a(z) "${searchTerm}" kifejezés letöltése közben a(z) "${category}" kategóriában${speed ? ` (${speed} MHz)` : ''}.`;
                    continue; // Continue to the next term if scraping fails
                }
            } else {
                results.push({ searchTerm, category, speed, listings });
            }
        } catch (error) {
            console.error(`Error fetching/scraping ${searchTerm}:`, error);
            statusMessage.innerHTML = `Hiba történt a(z) "${searchTerm}" kifejezés keresése közben a(z) "${category}" kategóriában${speed ? ` (${speed} MHz)` : ''}.`;
        }
    }

    if (results.length === 0) {
        recommendationsDiv.innerHTML = '<p>Nincs találat.</p>';
        statusMessage.innerHTML = 'Nincs találat.';
    } else {
        statusMessage.innerHTML = 'A keresés eredményes volt.';
        results.forEach(({ searchTerm, category, speed, listings }) => {
            const termDiv = document.createElement('div');
                        const h4 = document.createElement('h4');
                        h4.textContent = `Eredmények a(z) "${searchTerm}" kifejezésre a(z) "${category}" kategóriában${speed ? ` (${speed} MHz)` : ''}:`;
                        termDiv.appendChild(h4);

                        const list = document.createElement('ul');

                        if (listings.length === 0) {
                                const li = document.createElement('li');
                                li.textContent = 'Nincs találat.';
                                list.appendChild(li);
                        } else {
                                listings.forEach(listing => {
                                        const listItem = document.createElement('li');

                                        const strong = document.createElement('strong');
                                        strong.textContent = listing.title;
                                        listItem.appendChild(strong);
                                        listItem.append(` - ${listing.price} Ft`); 

                                        listItem.appendChild(document.createElement('br'));

                                        const em = document.createElement('em');
                                        em.textContent = "Helyszín: ";
                                        listItem.appendChild(em);
                                        listItem.append(listing.location);

                                        listItem.appendChild(document.createElement('br'));

                                        const a = document.createElement('a');
                                        a.href = listing.url;
                                        a.target = '_blank';
                                        a.textContent = 'Hirdetés megtekintése';
                                        listItem.appendChild(a);

                                        list.appendChild(listItem);
                                });
                        }

                        termDiv.appendChild(list);
                        recommendationsDiv.appendChild(termDiv);
                        
        });
        
    }

    
}



function handleCategoryChange(selectElement) {
    const parentInputGroup = selectElement.closest('.input-group');
    
    
    const existingDdrDropdown = parentInputGroup.querySelector('.ddr-select');
    if (existingDdrDropdown) {
        existingDdrDropdown.remove();
    }

    
    if (selectElement.value === 'memoria/asztali_gep_ram') {
        
        const ddrSelect = document.createElement('select');
        ddrSelect.className = 'form-control ddr-select'; 

        
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'Típus?'; 
        ddrSelect.appendChild(defaultOption);

        
        const ddrOptions = [
            { value: 'memoria/asztali_gep_ram/ddr_ram', text: 'DDR' },
            { value: 'memoria/asztali_gep_ram/ddr2_ram', text: 'DDR2' },
            { value: 'memoria/asztali_gep_ram/ddr3_ram', text: 'DDR3' },
            { value: 'memoria/asztali_gep_ram/ddr4_ram', text: 'DDR4', default: true }, // Set DDR4 as default
            { value: 'memoria/asztali_gep_ram/ddr5_ram', text: 'DDR5' }
        ];

        ddrOptions.forEach(optionData => {
            const option = document.createElement('option');
            option.value = optionData.value;
            option.textContent = optionData.text;
			if (optionData.default) option.selected = true; // Pre-select DDR4
            ddrSelect.appendChild(option);
        });

        
        parentInputGroup.appendChild(ddrSelect);

       

        const mhzSelect = document.createElement('select');
        mhzSelect.className = 'form-control mhz-select';

        const defaultOptionMhz = document.createElement('option');
        defaultOptionMhz.value = '';
        defaultOptionMhz.textContent = 'Mhz?';
        mhzSelect.appendChild(defaultOptionMhz);

        
        const mhzOptions = [
            { value: '1333', text: '1333' },
            { value: '1600', text: '1600' },
            { value: '1866', text: '1866' },
            { value: '2133', text: '2133' },
            { value: '2400', text: '2400' },
            { value: '2666', text: '2666' },
            { value: '2933', text: '2933' },
            { value: '3200', text: '3200', default: true }, // Set 3200 as default
            { value: '3600', text: '3600' },
            { value: '4000', text: '4000' },
            { value: '4266', text: '4266' },
            { value: '4400', text: '4400' },
            { value: '4600', text: '4600' },
            { value: '4800', text: '4800' },
            { value: '5000', text: '5000' },
            { value: '5200', text: '5200' },
            { value: '5400', text: '5400' },
            { value: '5600', text: '5600' },
            { value: '6000', text: '6000' },
            { value: '6200', text: '6200' },
            { value: '6400', text: '6400' },
            { value: '6600', text: '6600' },
            { value: '6800', text: '6800' },
            { value: '7000', text: '7000' },
            { value: '7200', text: '7200' },
            { value: '7600', text: '7600' },
            { value: '7800', text: '7800' },
            { value: '8000', text: '8000' }
        ];

        mhzOptions.forEach(optionData => {
            const option = document.createElement('option');
            option.value = optionData.value;
            option.textContent = optionData.text;
            if (optionData.default) option.selected = true; // Pre-select 3200
            mhzSelect.appendChild(option);
        });

        parentInputGroup.appendChild(mhzSelect);


    }
}


function addInputField() {
    const form = document.querySelector('form');
    const newInputGroup = document.createElement('div');
    newInputGroup.className = 'input-group';

    const select = document.createElement('select');
    select.className = 'form-control category-select';

    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'Minden'; // "All categories"
    select.appendChild(defaultOption);

    const options = [
        { value: 'processzor', text: 'Processzor' },
        { value: 'alaplap', text: 'Alaplap' },
        { value: 'memoria/asztali_gep_ram', text: 'Memória' },
        { value: 'videokartya', text: 'Videokártya' },
        { value: 'merevlemez_ssd/merevlemez', text: 'HDD' },
        { value: 'merevlemez_ssd/ssd', text: 'SSD' },
        { value: 'haz_tapegyseg', text: 'Ház, táp' }
    ];

    options.forEach(optionData => {
        const option = document.createElement('option');
        option.value = optionData.value;
        option.textContent = optionData.text;
        select.appendChild(option);
    });

    newInputGroup.appendChild(select);

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Keresett alkatrész'; // 
    newInputGroup.appendChild(input);

    input.addEventListener('input', function() {
        this.value = this.value.toLowerCase();
    });

    form.appendChild(newInputGroup);
}



document.addEventListener('DOMContentLoaded', () => {
    const averageButton = document.getElementById('average-price-button');
    const searchButton = document.querySelector('.search-button');
    const addButton = document.querySelector('.add-button');
    const clearButton = document.querySelector('.clear-all-button');
    const searchInputs = document.querySelectorAll('input[type="text"]');
    const statusMessage = document.getElementById('status-message');

    // Function to set up input validation for a single input element
    function setupInputValidation(input) {
        input.addEventListener('input', () => {
            let inputValue = input.value;
            const allowedChars = /^[\w\s\u00C0-\u017F() -]*$/;

            if (!allowedChars.test(inputValue)) {
                inputValue = inputValue.replace(/[^\w\s\u00C0-\u017F() -]/g, '');
                input.value = inputValue;
                statusMessage.textContent = "Csak betűk, számok, szóközök, kötőjelek, zárójelek és európai karakterek engedélyezettek.";
            } else {
                statusMessage.textContent = "";
            }
        });
    }

    // Initial setup for existing inputs
    // Initial setup for existing inputs and enforce lowercase
    searchInputs.forEach(input => {
        setupInputValidation(input);
        input.addEventListener('input', function() {
            this.value = this.value.toLowerCase();
        });
    });

    //  event listeners
    document.addEventListener('change', function (event) {
        if (event.target && event.target.classList.contains('category-select')) {
            handleCategoryChange(event.target);
        } else if (event.target && event.target.type === 'text') {
            setupInputValidation(event.target); 
        }
    });

    document.addEventListener('keydown', function(event) {
        if (event.key === 'Enter') {
            
          
                event.preventDefault();

                fetchRecommendations(false); // Normál keresés
                
            
        }
    });

    
    const categorySelects = document.querySelectorAll('.category-select');
    categorySelects.forEach(select => {
        if (select.value === 'memoria/asztali_gep_ram') {
            handleCategoryChange(select); 
        }
    });

    averageButton.addEventListener('click', () => {
        averageButton.classList.add('active');
        searchButton.classList.remove('active');
        fetchRecommendations(true);
    });

    searchButton.addEventListener('click', () => {
        searchButton.classList.add('active');
        searchButton.classList.remove('active');
        fetchRecommendations(false);
    });

    addButton.addEventListener('click', addInputField);

    clearButton.addEventListener('click', clearAllInputFields); 
});


function clearAllInputFields() {
    const form = document.querySelector('form');
    const inputGroups = form.querySelectorAll('.input-group');

    inputGroups.forEach(group => {
    const searchInput = group.querySelector('input[type="text"]');
    if (searchInput) {
        searchInput.value = ''; 
    }
    });
}


