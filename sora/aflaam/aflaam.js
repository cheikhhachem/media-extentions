const BASE_URL = "https://aflaam.com";
const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function getText(url) {
    const response = await fetchv2(url, { "User-Agent": USER_AGENT });
    return response.text();
}

function text(value) {
    return value.replace(/<[^>]*>/g, "").replace(/&quot;/g, "\"").replace(/&amp;/g, "&").trim();
}

async function searchResults(keyword) {
    try {
        const html = await getText(BASE_URL + "/search?q=" + encodeURIComponent(keyword));
        const results = [];
        const pattern = /<a href="(https?:\/\/aflaam\.com\/(?:movie|series)\/[^\"]+)" class="box">[\s\S]*?<img[^>]+src="([^"]+)"[\s\S]*?<h3[^>]+class="entry-title[^\"]*"[^>]*>([\s\S]*?)<\/h3>/g;
        let match;

        while ((match = pattern.exec(html)) !== null) {
            results.push({ title: text(match[3]), image: match[2], href: match[1] });
        }

        return JSON.stringify(results);
    } catch (error) {
        console.log("Aflam search error: " + error);
        return JSON.stringify([]);
    }
}

async function extractDetails(url) {
    try {
        const html = await getText(url);
        const description = (html.match(/<meta property="og:description" content="([^"]*)"/i) || [, ""])[1] || "No description available";
        const year = (html.match(/سنة الإنتاج\s*:\s*(\d{4})/) || [, "Unknown"])[1];

        return JSON.stringify([{
            description: text(description),
            aliases: "N/A",
            airdate: year
        }]);
    } catch (error) {
        console.log("Aflam details error: " + error);
        return JSON.stringify([]);
    }
}

async function extractEpisodes(url) {
    try {
        if (url.includes("/movie/")) {
            return JSON.stringify([{ href: url, number: 1, title: "Full Movie" }]);
        }

        const html = await getText(url);
        const episodes = [];
        const pattern = /<a href="(https?:\/\/aflaam\.com\/episode\/[^\"]+)" class="d-block box">[\s\S]*?<h3[^>]+class="entry-title[^\"]*"[^>]*>\s*<span[^>]*>(\d+)<\/span>([\s\S]*?)<\/h3>/g;
        let match;

        while ((match = pattern.exec(html)) !== null) {
            episodes.push({ href: match[1], number: Number(match[2]), title: text(match[3]) });
        }

        return JSON.stringify(episodes);
    } catch (error) {
        console.log("Aflam episodes error: " + error);
        return JSON.stringify([]);
    }
}

async function extractStreamUrl(url) {
    try {
        let html = await getText(url);
        if (!/<video[^>]+id="player"/i.test(html)) {
            const watchUrl = (html.match(/<a href="([^"]+)"\s+class="link-show/) || [, ""])[1];
            if (!watchUrl) return JSON.stringify({ streams: [], subtitles: "" });
            html = await getText(watchUrl);
        }

        const streams = [];
        const sourcePattern = /<source\b[^>]*>/gi;
        let source;

        while ((source = sourcePattern.exec(html)) !== null) {
            const src = (source[0].match(/src="([^"]+)"/) || [, ""])[1];
            const size = (source[0].match(/size="([^"]+)"/) || [, ""])[1];
            if (src) streams.push({ title: "Aflam " + (size || "MP4") + "p", streamUrl: src, headers: {} });
        }

        return JSON.stringify({ streams: streams, subtitles: "" });
    } catch (error) {
        console.log("Aflam stream error: " + error);
        return JSON.stringify({ streams: [], subtitles: "" });
    }
}
