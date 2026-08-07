const BASE_URL = "https://topcinemaa.co";
const USER_AGENT = "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36";

async function getText(url, referer, method, body) {
    const headers = {
        "User-Agent": USER_AGENT,
        "Accept-Language": "ar-EG,ar;q=0.9,en-US;q=0.8,en;q=0.7",
        "Referer": referer || BASE_URL + "/"
    };
    if (method === "POST") {
        headers["X-Requested-With"] = "XMLHttpRequest";
        headers["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8";
        headers["Accept"] = "*/*";
    }
    const response = await fetchv2(url, headers, method || "GET", body);
    return response.text();
}

function text(value) {
    return (value || "")
        .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"")
        .replace(/&#039;|&apos;/g, "'").replace(/&amp;/g, "&")
        .replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function searchTitle(value, keyword) {
    const requestedYears = keyword.match(/\b20(?:0[1-9]|[1-9]\d)\b/g) || [];
    return value
        .replace(/اون\s+لاين|اونلاين|اولاين|مترجمة|مترجم|فيلم|مسلسل|انمي|أنمي|كامل|الأول|الاول|الأخيرة|الاخيرة|و|الأخير|الاخير/g, " ")
        .replace(/\b20(?:0[1-9]|[1-9]\d)\b/g, (year) => requestedYears.includes(year) ? year : " ")
        .replace(/\s+/g, " ").trim();
}

async function searchResults(keyword) {
    try {
        const html = await getText(BASE_URL + "/search/?query=" + encodeURIComponent(keyword) + "&type=all");
        const results = [];
        const entries = [];
        const series = {};
        const pattern = /<div class="Small--Box">\s*<a href="([^"]+)" title="([^"]*)" class="recent--block">[\s\S]*?<div class="Poster">\s*<img[^>]+(?:data-src="([^"]+)"[^>]*|src="([^"]+)"[^>]*)>[\s\S]*?<h3 class="title">([\s\S]*?)<\/h3>\s*<\/a>\s*<\/div>/g;
        let match;

        while ((match = pattern.exec(html)) !== null) {
            const result = {
                title: text(match[2] || match[5]),
                image: match[3] || match[4],
                href: match[1]
            };
            if (/^(?:مسلسل|انمي|أنمي)\s/i.test(result.title)) {
                const key = result.title
                    .replace(/\s+(?:الموسم|الحلقة)[\s\S]*$/, "")
                    .replace(/\s+(?:مترجم(?:ة)?|مدبلج(?:ة)?)[\s\S]*$/, "")
                    .toLowerCase();
                if (!series[key]) {
                    series[key] = result;
                    entries.push(key);
                }
            } else {
                entries.push(result);
            }
        }

        for (const entry of entries) {
            if (typeof entry !== "string") {
                results.push(entry);
                continue;
            }

            const result = series[entry];
            if (!result.href.includes("/series/")) {
                const episodeHtml = await getText(result.href);
                const parentPattern = /<a href="(https?:\/\/topcinemaa\.co\/series\/[^"]+)"[^>]*>\s*<span>([^<]+)<\/span>\s*<\/a>/gi;
                let parent;
                while ((parent = parentPattern.exec(episodeHtml)) !== null) {
                    if (!/الموسم/.test(parent[2])) {
                        result.href = parent[1];
                        result.title = text(parent[2]);
                        break;
                    }
                }
            }
            results.push(result);
        }

        for (const result of results) result.title = searchTitle(result.title, keyword);

        return JSON.stringify(results);
    } catch (error) {
        console.log("TopCinema search error: " + error);
        return JSON.stringify([]);
    }
}

async function extractDetails(url) {
    try {
        const html = await getText(url);
        const description = text((html.match(/<div class="story">\s*<p>([\s\S]*?)<\/p>/i) || [])[1]
            || (html.match(/<meta property="og:description" content="([^"]*)"/i) || [])[1])
            || "No description available";
        const year = ((html.match(/href="[^"]*\/release-year\/(\d{4})\/?"/i) || [])[1]) || "Unknown";
        const genres = [];
        const genrePattern = /<a href="[^"]*\/genre\/[^"]+">([\s\S]*?)<\/a>/gi;
        let genre;

        while ((genre = genrePattern.exec(html)) !== null) genres.push(text(genre[1]));

        return JSON.stringify([{
            description: description,
            aliases: genres.join(", ") || "N/A",
            airdate: year
        }]);
    } catch (error) {
        console.log("TopCinema details error: " + error);
        return JSON.stringify([]);
    }
}

function episodesFromHtml(html, season) {
    const episodes = [];
    const pattern = /<a href="([^"]+)" title="([^"]*)">[\s\S]*?<div class="ep-info"><h2>([\s\S]*?)<\/h2><\/div>\s*<div class="epnum">\s*<span>الحلقة<\/span>\s*(\d+)\s*<\/div>\s*<\/a>/gi;
    let match;

    while ((match = pattern.exec(html)) !== null) {
        episodes.push({
            href: match[1],
            number: Number(match[4]),
            season: season,
            title: text(match[3] || match[2])
        });
    }
    return episodes;
}

async function extractEpisodes(url) {
    try {
        const html = await getText(url);
        let episodes = episodesFromHtml(html, Number((text((html.match(/<h1 class="post-title">[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i) || [])[1]).match(/الموسم\s+(\d+)/) || [])[1]) || 1);
        const seasons = [];
        const seasonPattern = /<div class="Small--Box Season">\s*<a href="([^"]+)"[\s\S]*?<div class="epnum"><span>الموسم<\/span>\s*(\d+)<\/div>/gi;
        let season;

        while ((season = seasonPattern.exec(html)) !== null) {
            seasons.push({ href: season[1], number: Number(season[2]) });
        }
        for (const item of seasons) {
            episodes = episodes.concat(episodesFromHtml(await getText(item.href), item.number));
        }

        if (episodes.length === 0) {
            const title = text((html.match(/<h1 class="post-title">[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i) || [])[1]);
            const number = Number((title.match(/الحلقة\s+(\d+)/) || [])[1]) || 1;
            episodes.push({ href: url, number: number, title: title || "Full Movie" });
        }

        episodes.sort((a, b) => (a.season || 1) - (b.season || 1) || a.number - b.number);
        return JSON.stringify(episodes);
    } catch (error) {
        console.log("TopCinema episodes error: " + error);
        return JSON.stringify([]);
    }
}

function decodeJsString(value) {
    const escapes = { "0": "\0", "b": "\b", "f": "\f", "n": "\n", "r": "\r", "t": "\t", "v": "\v" };
    return value.replace(/\\(?:u([0-9a-fA-F]{4})|x([0-9a-fA-F]{2})|(\r\n|[\r\n])|([\s\S]))/g, (_, unicode, hex, continuation, escaped) => {
        if (unicode) return String.fromCharCode(parseInt(unicode, 16));
        if (hex) return String.fromCharCode(parseInt(hex, 16));
        if (continuation) return "";
        return Object.prototype.hasOwnProperty.call(escapes, escaped) ? escapes[escaped] : escaped;
    });
}

function unpack(source) {
    const match = /}\s*\(\s*'((?:\\[\s\S]|[^'\\])*)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'((?:\\[\s\S]|[^'\\])*)'\s*\.split\s*\(\s*'\|'\s*\)/.exec(source);
    if (!match) return "";

    const payload = decodeJsString(match[1]);
    const radix = Number(match[2]);
    const count = Number(match[3]);
    const symbols = decodeJsString(match[4]).split("|");
    const alphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

    return payload.replace(/\b[0-9A-Za-z]+\b/g, (word) => {
        let value = 0;
        for (const rawCharacter of word) {
            const character = radix <= 36 ? rawCharacter.toLowerCase() : rawCharacter;
            const digit = alphabet.indexOf(character);
            if (digit < 0 || digit >= radix) return word;
            value = value * radix + digit;
        }
        return value < count && symbols[value] ? symbols[value] : word;
    });
}

async function extractStreamUrl(url) {
    try {
        const pageUrl = url.replace(/\/(?:watch|download)\/?$/, "/");
        const watchUrl = pageUrl.replace(/\/?$/, "/watch/");
        const watchHtml = await getText(watchUrl, pageUrl);
        const serverPattern = /<li[^>]+data-id="([^"]+)"[^>]+data-server="([^"]+)"[^>]*>[\s\S]*?<span>([^<]+)<\/span>/gi;
        let server;
        let streamWish;

        while ((server = serverPattern.exec(watchHtml)) !== null) {
            if (/streamwish/i.test(server[3])) streamWish = { id: server[1], index: server[2] };
        }
        if (!streamWish) return JSON.stringify({ streams: [], subtitles: "" });

        const ajaxHtml = await getText(
            BASE_URL + "/wp-content/themes/movies2023/Ajaxat/Single/Server.php",
            watchUrl,
            "POST",
            "id=" + encodeURIComponent(streamWish.id) + "&i=" + encodeURIComponent(streamWish.index)
        );
        const embedUrl = (ajaxHtml.match(/<iframe[^>]+src="([^"]+)"/i) || [])[1];
        if (!embedUrl) return JSON.stringify({ streams: [], subtitles: "" });

        const embedHtml = await getText(embedUrl, watchUrl);
        const decoded = unpack(embedHtml) || embedHtml;
        const streams = [];
        const urlPattern = /https?:\/\/[^"'\\\s]+\.m3u8[^"'\\\s]*/gi;
        let stream;

        while ((stream = urlPattern.exec(decoded)) !== null) {
            const streamUrl = stream[0].replace(/&amp;/g, "&");
            if (!streams.some((item) => item.streamUrl === streamUrl)) {
                streams.push({
                    title: "TopCinema StreamWish HLS",
                    streamUrl: streamUrl,
                    headers: { "Referer": embedUrl, "User-Agent": USER_AGENT }
                });
            }
        }

        return JSON.stringify({ streams: streams, subtitles: "" });
    } catch (error) {
        console.log("TopCinema stream error: " + error);
        return JSON.stringify({ streams: [], subtitles: "" });
    }
}
