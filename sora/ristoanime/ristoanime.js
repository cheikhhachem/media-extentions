const BASE_URL = "https://ristoanime.me";
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
        const html = await getText(BASE_URL + "/?s=" + encodeURIComponent(keyword));
        const results = [];
        const pattern = /<div[^>]+class=["'][^"']*\bMovieItem\b[^"']*["'][^>]*>\s*<a[^>]+href=["']([^"']+)["'][^>]*>[\s\S]*?<div[^>]+class=["'][^"']*\bposter\b[^"']*["'][^>]+(?:style|data-style)=["'][^"']*?url\(([^)]+)\)[^"']*["'][^>]*>[\s\S]*?<h4[^>]*>([\s\S]*?)<\/h4>/gi;
        let match;

        while ((match = pattern.exec(html)) !== null) {
            results.push({
                title: text(match[3]),
                image: absoluteUrl(match[2].replace(/["']/g, "").trim()),
                href: absoluteUrl(match[1])
            });
        }

        return JSON.stringify(results);
    } catch (error) {
        console.log("Risto Anime search error: " + error);
        return JSON.stringify([]);
    }
}

async function extractDetails(url) {
    try {
        const html = await getText(url);
        const description = text((html.match(/<div[^>]+class=["'][^"']*\bStoryArea\b[^"']*["'][^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i) || [, ""])[1]) || "No description available";
        const airdate = text((html.match(/تاريخ الاصدار\s*:[\s\S]{0,200}?<a[^>]*>([\s\S]*?)<\/a>/i) || [, ""])[1]) || "Unknown";

        return JSON.stringify([{
            description: description,
            aliases: "N/A",
            airdate: airdate
        }]);
    } catch (error) {
        console.log("Risto Anime details error: " + error);
        return JSON.stringify([]);
    }
}

async function extractEpisodes(url) {
    try {
        const html = await getText(url);
        const episodes = [];
        const pattern = /<a[^>]+href=["']([^"']+)["'][^>]*>\s*الحلقة\s*<em>\s*(\d+)\s*<\/em>/gi;
        let match;

        while ((match = pattern.exec(html)) !== null) {
            episodes.push({ href: absoluteUrl(match[1]), number: Number(match[2]) });
        }

        episodes.sort((a, b) => a.number - b.number);
        return JSON.stringify(episodes);
    } catch (error) {
        console.log("Risto Anime episodes error: " + error);
        return JSON.stringify([]);
    }
}

async function extractStreamUrl(url) {
    try {
        const html = await getText(url);
        const providerMatch = html.match(/data-watch=["']([^"']*vidmoly[^"']+)["']/i)
            || html.match(/<iframe[^>]+src=["']([^"']*vidmoly[^"']+)["']/i);
        if (!providerMatch) return JSON.stringify({ streams: [], subtitles: "" });

        const providerUrl = providerMatch[1].replace(/&amp;/g, "&");
        const providerHtml = await getText(providerUrl, url);
        const streamMatch = providerHtml.match(/\bsources\s*:\s*\[\s*\{\s*file\s*:\s*["'](https?:\/\/[^"']+\.m3u8\?[^"']+)["']/i);
        if (!streamMatch) return JSON.stringify({ streams: [], subtitles: "" });

        return JSON.stringify({
            streams: [{
                title: "VidMoly",
                streamUrl: streamMatch[1].replace(/&amp;/g, "&"),
                headers: { "User-Agent": USER_AGENT }
            }],
            subtitles: ""
        });
    } catch (error) {
        console.log("Risto Anime stream error: " + error);
        return JSON.stringify({ streams: [], subtitles: "" });
    }
}
