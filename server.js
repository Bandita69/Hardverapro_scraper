const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());



const Queue = require('bull');

const scrapeQueue = new Queue('scrapeQueue', {
    redis: { host: '127.0.0.1', port: 6379 }, // Connect to Bepis 🐦
});

scrapeQueue.process(async (job) => {
    const { query, category } = job.data;

    console.log(`Processing scrape task for query: "${query}", category: "${category}"`);

    try {



        if (category === '') {
            await scrapeListings(`https://hardverapro.hu/aprok/hardver/keres.php?search_exac=1&search_title=1&stext=${encodeURIComponent(query)}&minprice=10&buying=0&noiced=1`, category.toLowerCase());
        } else {
            await scrapeListings(`https://hardverapro.hu/aprok/hardver/${category.toLowerCase()}/keres.php?stext=${query}&stcid_text=&stcid=&stmid_text=&stmid=&minprice=&maxprice=&cmpid_text=&cmpid=&usrid_text=&usrid=&buying=0&stext_none=&search_exac=1&search_title=1&noiced=1`, category.toLowerCase());
        }

        // https://hardverapro.hu/aprok/hardver/merevlemez_ssd/ssd/keres.php?stext=120gb&search_exac=1&search_title=1&minprice=10&buying=0&noiced=1


        console.log(`Scrape task completed for query: "${query}", category: "${category}"`);
    } catch (err) {
        console.error(`Error processing scrape task for query: "${query}", category: "${category}":`, err);
        throw err; // Let Bull handle retries if needed
    }
});

scrapeQueue.on('completed', (job) => {
    console.log(`Job completed for query: "${job.data.query}", category: "${job.data.category}"`);
});

scrapeQueue.on('failed', (job, err) => {
    console.error(`Job failed for query: "${job.data.query}", category: "${job.data.category}":`, err);
});

app.use(
    helmet.contentSecurityPolicy({
        directives: {
            defaultSrc: ["'self'"],
            baseUri: ["'self'"],
            fontSrc: ["'self'", "https:", "data:"],
            formAction: ["'self'"],
            frameAncestors: ["'self'"],
            imgSrc: ["'self'", "data:", "i.imgur.com"], // Added i.imgur.com here
            objectSrc: ["'none'"],
            scriptSrc: ["'self'"],
            "script-src-attr": ["'none'"],
            styleSrc: ["'self'", "https:", "'unsafe-inline'"],
            "upgrade-insecure-requests": [],
        },
    })
);



// Rate limiting to prevent abuse of the server
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // Limit each IP to 1000 requests per windowMs
    message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);



const db = new sqlite3.Database(process.env.DATABASE || 'hardverapro.db', (err) => {
    if (err) {
        console.error('Error connecting to database:', err);
        process.exit(1);
    }
    console.log('Connected to the hardverapro database.');
});

// Helper function to extract GPU/CPU names from the title, for enhanced search
function extractGpuNames(title) {
    const gpuKeywords = [
        '4090', '4080', '4070', '4060',
        '3090', '3080', '3070', '3060',
        '2080', '2070', '2060',
        '1660', '1650',
        '1080', '1070', '1060', '1050',
        '7900', '7800', '7700', '7600',
        '6950', '6900', '6800', '6750', '6700', '6650', '6600',
        '6500', '6400',
        '5700', '5600', '5500',
        'VII', 'Vega64', 'Vega56',
        '590', '580', '570', '560', '550',
        '480', '470', '460',
        'Titan',
        'A6000', 'A5500', 'A5000', 'A4500', 'A4000', 'A2000',
        'Quadro', '760', '600', '400',
        '1030'
    ];

    // Ensure exact matching using word boundaries
    const matchedGpus = gpuKeywords.filter(gpu => {
        const regex = new RegExp(`\\b${gpu}\\b`, 'i'); // Match exact GPU name (case-insensitive)
        return regex.test(title);
    });

    return matchedGpus;
}

// Helper function to extract GPU type from the title like ti, super, xt, xtx, etc.
function extractGpuType(title) {
    const gpuTypes = ['ti', 'super', 'xt', 'xtx', 'xt+'];

    const matchedTypes = gpuTypes.filter(type => {
        const regex = new RegExp(`\\b${type}\\b`, 'i');
        return regex.test(title);
    });

    return matchedTypes;
}


function calculateIQRMean(values) {
    if (values.length <= 1) return values.length === 1 ? values[0] : 0;

    const sortedValues = values.slice().sort((a, b) => a - b);
    const q1Index = Math.floor(sortedValues.length * 0.25);
    const q3Index = Math.floor(sortedValues.length * 0.75);

    const iqrValues = sortedValues.slice(q1Index, q3Index + 1);

    if (iqrValues.length === 0) return 0;
    const sum = iqrValues.reduce((acc, val) => acc + val, 0);
    return sum / iqrValues.length;
}


function lowerTrimmedMean(values, lowTrimPercent = 0.1, highTrimPercent = 0.1) {
    if (values.length <= 2) {
        // Handle small arrays
        return values.length === 1
            ? values[0]
            : (values.length === 2 ? (values[0] + values[1]) / 2 : 0);
    }

    // Sort the values in ascending order
    const sortedValues = values.slice().sort((a, b) => a - b);

    // Remove any value that is greater than the second largest value
    const secondLargest = sortedValues[sortedValues.length - 2];
    const filteredValues = sortedValues.filter(value => value <= secondLargest);

    // Determine how many values to trim based on percentages
    const lowTrimCount = Math.floor(filteredValues.length * lowTrimPercent);
    const highTrimCount = Math.floor(filteredValues.length * highTrimPercent);

    // Trim values from both ends
    const trimmedValues = filteredValues.slice(lowTrimCount, filteredValues.length - highTrimCount);

    if (trimmedValues.length === 0) {
        // Handle the case where all values are trimmed
        return 0;
    }

    // Calculate the mean of the remaining values
    const sum = trimmedValues.reduce((acc, val) => acc + val, 0);
    return sum / trimmedValues.length;
}

async function getListingsFromDatabase(db, query, category, speed) {
    return new Promise((resolve, reject) => {
        let sql = `SELECT title, price FROM listings WHERE title LIKE ? AND is_multi_gpu = 0`;
        const params = [`%${query}%`];

        if (category) {
            sql += ` AND category = ?`;
            params.push(category.toLowerCase());
        }

        if (speed) {
            sql += ` AND speed = ?`;
            params.push(speed);
        }

        db.all(sql, params, (err, rows) => {
            if (err) {
                console.error("Database error:", err);
                reject(err);
            }
            resolve(rows);
        });
    });
}

async function scrapeListings(url, category) {
    try {

        // print the url to the console
        console.log(url);
        const response = await axios.get(url, { timeout: 10000 }); // Set timeout to avoid long waits
        const $ = cheerio.load(response.data);

        const listings = $('li.media');
        const listingsArray = Array.from(listings);

        const excludedWords = [
            new RegExp('(hib[áa]s)', 'i'), // hibás, hibas
            new RegExp('(alkatr[ée]sz)', 'i'), // alkatrész, alkatresz
            new RegExp('(f[ée]lkonfig)', 'i'), // félkonfig, felkonfig
            // felvásárlás, felvásárlása
            new RegExp('(felv[áa]s[áa]rl[áa]s)', 'i'),
            new RegExp('(felv[áa]s[áa]rl[áa]sa)', 'i'),
            'csere', 'keresek', 'elkelt', 'jegelve', 'eladva', 'lapok', 'szerver', 'darab'
        ];

        const scrapedUrls = []; // Array to store scraped URLs

        for (const element of listingsArray) {
            const title = $(element).find('.uad-title h1 a').text().trim();

            // Check if the listing contains excluded words
            const isExcluded = excludedWords.some(word => {
                if (word instanceof RegExp) {
                    return word.test(title);
                } else {
                    return title.toLowerCase().includes(word);
                }
            });

            if (isExcluded) {
                console.log(`Skipping listing (contains excluded word): ${title}`);
                continue;
            }

            // Extract price, location, and URL
            const priceText = $(element).find('.uad-price').text().trim();
            const location = $(element).find('.uad-light').text().trim();
            const listingUrl = $(element).find('a.uad-image').attr('href').trim();

            const price = parseInt(priceText.replace(/\s/g, '').replace('Ft', ''), 10);
            const fullUrl = listingUrl;

            // Check if the listing already exists in the database
            const existingListing = await new Promise((resolve, reject) => {
                db.get('SELECT id FROM listings WHERE url = ?', [fullUrl], (err, row) => {
                    if (err) reject(err);
                    resolve(row);
                });
            });

            scrapedUrls.push(fullUrl); // Add the URL to the scrapedUrls array

            if (!existingListing) {
                // Extract GPU-related info
                const gpuNames = extractGpuNames(title);
                const isMultiGpu = gpuNames.length > 1;
                const gpuType = extractGpuType(title);
                const isTi = gpuType.includes('ti');
                const isSuper = gpuType.includes('super');
                const isXt = gpuType.includes('xt');
                const isXtx = gpuType.includes('xtx');

                // Extract speed from the title (e.g., "3200 MHz")
                const speedMatch = title.match(/(\d+)\s?MHz/i); // Match numbers followed by "MHz"
                const speed = speedMatch ? speedMatch[1] : null; // Extract the speed or set to null if not found

                // Insert the new listing into the database
                const listingId = await new Promise((resolve, reject) => {
                    db.run(
                        'INSERT INTO listings (title, price, location, url, category, is_multi_gpu, is_ti, is_super, is_xt, is_xtx, speed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                        [title, price, location, fullUrl, category, isMultiGpu ? 1 : 0, isTi ? 1 : 0, isSuper ? 1 : 0, isXt ? 1 : 0, isXtx ? 1 : 0, speed],
                        function (err) {
                            if (err) reject(err);
                            resolve(this.lastID);
                        }
                    );
                });

                console.log(`Added new listing: ${title} (${price} Ft, Speed: ${speed || 'N/A'})`);
            } else {
                console.log(`Listing already exists: ${title}`);


            }
        }

        return;
    } catch (err) {
        console.error('Error scraping listings:', err);
    }
}

app.get('/scrape', async (req, res) => {
    const query = req.query.q;
    const category = req.query.category;

    if (!query || !category) {
        return res.status(400).send('Missing search query or category');
    }

    try {
        // Add the task to the Bull queue
        await scrapeQueue.add({ query, category });

        res.send(`Scraping task for query "${query}" in category "${category}" has been added to the queue.`);
    } catch (err) {
        console.error('Error adding task to queue:', err);
        res.status(500).send('Error adding task to queue.');
    }
});


app.post('/average-price', async (req, res) => {
    const searchTerms = req.body;


    if (!Array.isArray(searchTerms) || searchTerms.length === 0) {
        return res.status(400).json({ error: 'Invalid or missing search terms' });
    }

    try {
        const averagePrices = [];

        for (const { searchTerm, category, speed } of searchTerms) {
            if (!searchTerm) {
                return res.status(400).json({ error: 'Invalid search term' });
            }

            // Get listings from the database
            let listings = await getListingsFromDatabase(db, searchTerm, category, speed);

            // Scrape if no listings are found
            if (listings.length === 0 && category) {
                const baseUrl = `${req.protocol}://${req.get('host')}`;
                const scrapeRes = await axios.get(`${baseUrl}/scrape?q=${encodeURIComponent(searchTerm)}&category=${encodeURIComponent(category)}`);
                if (scrapeRes.data.includes('Scraping completed')) {
                    listings = await getListingsFromDatabase(db, searchTerm, category, speed);
                }
            }

            const prices = listings.map(listing => parseInt(listing.price, 10)).filter(price => !isNaN(price));
            const averagePrice = prices.length > 0 ? lowerTrimmedMean(prices) : 0;

            averagePrices.push({ term: searchTerm, category, speed, averagePrice });
        }

        res.json(averagePrices);
    } catch (error) {
        console.error('Error calculating average prices:', error);
        res.status(500).send('Error calculating average prices');
    }
});


app.get('/search', async (req, res) => {
    const query = req.query.q || '';
    const category = req.query.category.toLowerCase() || '';
    const speed = req.query.speed || '';
    const includeMultiGpu = req.query.includeMultiGpu === 'true';

    try {

        const existingSearch = await new Promise((resolve, reject) => {
            db.get(
                'SELECT * FROM search_history WHERE query = ? AND category = ?',
                [query, category],
                (err, row) => {
                    if (err) reject(err);
                    resolve(row);
                }
            );
        });


        if (existingSearch) {
            console.log(`Query "${query}" in category "${category}" already searched recently. Using existing data.`);
            console.log('if ag');
            const listings = await getFilteredListings(query, category, speed, includeMultiGpu);
            return res.json(listings);
        } else {
            await new Promise((resolve, reject) => {
                db.run(
                    `INSERT INTO search_history (query, category) 
                   VALUES (?, ?)`,
                    [query, category],
                    (err) => {
                        if (err) {
                            console.error("Database update/insert error:", err);
                            reject(err);
                        }
                        resolve();
                    }
                );
            });

            console.log('else ag');
            console.log(`Searching for "${query}" in category "${category}" (scraping new data)...`);


            if (category === '') {
                await scrapeListings(`https://hardverapro.hu/aprok/hardver/keres.php?search_exac=1&search_title=1&stext=${encodeURIComponent(query)}&minprice=10&buying=0&noiced=1`, category.toLowerCase());
            } else {
                await scrapeListings(`https://hardverapro.hu/aprok/hardver/${category.toLowerCase()}/keres.php?stext=${query}&stcid_text=&stcid=&stmid_text=&stmid=&minprice=&maxprice=&cmpid_text=&cmpid=&usrid_text=&usrid=&buying=0&stext_none=&search_exac=1&search_title=1&noiced=1`, category.toLowerCase());
            }

            const listingsAfterScrape = await getFilteredListings(query, category, speed, includeMultiGpu);
            return res.json(listingsAfterScrape);
        }



    } catch (err) {
        console.error('Error searching listings:', err);
        res.status(500).send('Error searching data');
    }
});

// Helper function to get filtered listings 
async function getFilteredListings(query, category, speed, includeMultiGpu) {
    console.log('getFilteredListings, query:', query, 'category:', category, 'speed:', speed, 'includeMultiGpu:', includeMultiGpu);
    return new Promise((resolve, reject) => {
        // Base SQL query where title like query

        let sql = `SELECT * FROM listings 
            WHERE (
                title LIKE ? OR 
                title LIKE ? OR 
                title LIKE ? OR 
                title = ? OR
                location LIKE ?
            ) 
            AND category = ?`;

        // Add spaces around the query to enforce word-like matching
        const params = [
            `% ${query} %`,  // Surrounded by spaces (middle of title)
            `${query} %`,    // At the start followed by a space
            `% ${query}`,    // At the end preceded by a space
            `${query}`,      // Exact match (e.g., "4070 Ti")
            `%${query}%`,    // Location search (kept broad)
            category.toLowerCase()
        ];


        // Handle specific GPU variants (Ti, Super, XT, etc.)
        const lowerQuery = query.toLowerCase();
        if (lowerQuery.includes('ti')) {
            sql += ` AND is_ti = 1`;
        } else {
            sql += ` AND is_ti = 0`;
        }

        if (lowerQuery.includes('super')) {
            sql += ` AND is_super = 1`;
        } else {
            sql += ` AND is_super = 0`;
        }

        if (lowerQuery.includes('xt')) {
            sql += ` AND is_xt = 1`;
        } else {
            sql += ` AND is_xt = 0`;
        }

        if (lowerQuery.includes('xtx')) {
            sql += ` AND is_xtx = 1`;
        } else {
            sql += ` AND is_xtx = 0`;
        }


        if (speed) {
            sql += ` AND speed = ?`;
            params.push(speed);
        }


        if (!includeMultiGpu) {
            sql += ` AND is_multi_gpu = 0`;
        }

        console.log('sql:', sql, 'params:', params);

        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            resolve(rows);
        });
    });
}
// Serve static files (HTML, CSS, JS, etc.)
app.use(express.static(path.join(__dirname, 'public')));


app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.set('trust proxy', 1);


app.get('/status', (req, res) => {
    res.json({ status: 'online' });
});

// Start server
app.listen(port, () => console.log(`Server listening on port ${port}`));




