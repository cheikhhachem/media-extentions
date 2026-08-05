const BASE_URL = "https://ww3.okanime.xyz";
const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function getText(url, referer) {
    const response = await fetchv2(url, {
        "User-Agent": USER_AGENT,
        "Referer": referer || BASE_URL + "/"
    });
    return response.text();
}

function text(value) {
    return value.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").trim();
}

function absoluteUrl(url) {
    return url.startsWith("http") ? url : BASE_URL + (url.startsWith("/") ? url : "/" + url);
}

async function searchResults(keyword) {
    try {
        const html = await getText(BASE_URL + "/anime-list?q=" + encodeURIComponent(keyword));
        const results = [];
        const cardPattern = /<div class="anime-card anime-hover">[\s\S]*?<img[^>]+src="([^"]+)"[^>]+alt="([^"]+)"[\s\S]*?<a href="([^"]*\/anime\/[^\"]+)" class="clickable"/g;
        let match;

        while ((match = cardPattern.exec(html)) !== null) {
            results.push({
                title: text(match[2]).replace(/\s*\|.*$/, ""),
                image: absoluteUrl(match[1]),
                href: absoluteUrl(match[3])
            });
        }

        return JSON.stringify(results);
    } catch (error) {
        console.log("Okanime search error: " + error);
        return JSON.stringify([]);
    }
}

async function extractDetails(url) {
    try {
        const html = await getText(url);
        const description = text((html.match(/<div class="synopsis-text"[^>]*>([\s\S]*?)<\/div>/) || [, ""])[1]) || "No description available";
        const year = text((html.match(/<dt>سنة العرض<\/dt>\s*<dd>([\s\S]*?)<\/dd>/) || [, ""])[1]) || "Unknown";
        const genres = [];
        const genrePattern = /<a[^>]+class="genre-tag"[^>]*>([\s\S]*?)<\/a>/g;
        let genre;

        while ((genre = genrePattern.exec(html)) !== null) genres.push(text(genre[1]));

        return JSON.stringify([{
            description: description,
            aliases: genres.join(", ") || "N/A",
            airdate: year
        }]);
    } catch (error) {
        console.log("Okanime details error: " + error);
        return JSON.stringify([]);
    }
}

async function extractEpisodes(url) {
    try {
        const html = await getText(url);
        const episodes = [];
        const episodePattern = /<a href="([^"]*\/episode\/[^\"]+)"\s+class="ep-compact-btn[^\"]*"\s+title="[^\"]*?(\d+)">/g;
        let match;

        while ((match = episodePattern.exec(html)) !== null) {
            episodes.push({ href: absoluteUrl(match[1]), number: Number(match[2]) });
        }

        return JSON.stringify(episodes);
    } catch (error) {
        console.log("Okanime episodes error: " + error);
        return JSON.stringify([]);
    }
}

function unpack(source) {
    const match = /}\('(.+)',\s*(\d+),\s*(\d+),\s*'(.+)'\.split\('\|'\)/.exec(source);
    if (!match) return "";

    const payload = match[1];
    const radix = Number(match[2]);
    const symbols = match[4].split("|");
    const alphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

    const decode = (value) => {
        if (radix <= 36) return parseInt(value, radix);
        return value.split("").reduce((total, character) => total * radix + alphabet.indexOf(character), 0);
    };

    return payload.replace(/\b\w+\b/g, (word) => symbols[decode(word)] || word);
}

function streamUrlFromEmbed(html) {
    const packed = html.match(/eval\(function\(p,a,c,k,e,d\)[\s\S]*?\.split\('\|'\)\)\)/);
    const source = packed ? unpack(packed[0]) : html;
    const match = source.match(/(?:file|src)\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)/i)
        || source.match(/["'](https?:[^"']+\.(?:m3u8|mp4)[^"']*)["']/i);
    return match ? match[1].replace(/\\\//g, "/").replace(/&amp;/g, "&") : null;
}

async function extractStreamUrl(url) {
    try {
        const html = await getText(url);
        const streams = [];
        const serverPattern = /data-server="([^"]+)"[\s\S]*?@click="setServer\('([^']+)'\)"[\s\S]*?<span>([^<]+)<\/span>/g;
        let match;

        while ((match = serverPattern.exec(html)) !== null) {
            const name = match[1];
            const embedUrl = match[2].replace(/&amp;/g, "&");

            try {
                const embedHtml = await getText(embedUrl, url);
                const streamUrl = streamUrlFromEmbed(embedHtml);
                if (streamUrl && !streams.some((stream) => stream.streamUrl === streamUrl)) {
                    streams.push({
                        title: name + " " + match[3].trim(),
                        streamUrl: streamUrl,
                        headers: {
                            "Referer": embedUrl,
                            "User-Agent": USER_AGENT
                        }
                    });
                }
            } catch (error) {
                console.log("Okanime provider unavailable (" + name + "): " + error);
            }
        }

        return JSON.stringify({ streams: streams, subtitles: "" });
    } catch (error) {
        console.log("Okanime stream error: " + error);
        return JSON.stringify({ streams: [], subtitles: "" });
    }
}
