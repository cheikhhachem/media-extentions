const SUGGESTION_URL = "https://v3.sg.media-imdb.com/suggestion/x/";
const TVMAZE_URL = "https://api.tvmaze.com";
const STREAM_URL = "https://streamdata.vaplayer.ru/api.php";
const PLAYER_ORIGIN = "https://nextgencloudfabric.com";
const USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36";

async function getJson(url, headers) {
    const response = await fetchv2(url, headers || { "User-Agent": USER_AGENT });
    return response.json();
}

function isSeries(item) {
    return /series/i.test(item.qid || "") || /series/i.test(item.q || "");
}

function titleUrl(id, type) {
    return "https://player.imdb.su/embed/" + type + "/" + id;
}

function parseTitleUrl(url) {
    const match = url.match(/\/embed\/(movie|tv)\/(tt\d{7,8})/i);
    return match ? { type: match[1].toLowerCase(), id: match[2].toLowerCase() } : null;
}

function stripHtml(value) {
    return (value || "").replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").trim();
}

function streamHeaders() {
    return {
        "Referer": PLAYER_ORIGIN + "/",
        "Origin": PLAYER_ORIGIN,
        "User-Agent": USER_AGENT
    };
}

async function searchResults(keyword) {
    try {
        const data = await getJson(SUGGESTION_URL + encodeURIComponent(keyword) + ".json");
        const results = [];

        for (const item of data.d || []) {
            if (!/^tt\d{7,8}$/i.test(item.id || "")) continue;
            const type = isSeries(item) ? "tv" : "movie";
            results.push({
                title: item.l || item.id,
                image: item.i && item.i.imageUrl ? item.i.imageUrl : "",
                href: titleUrl(item.id, type)
            });
        }

        return JSON.stringify(results);
    } catch (error) {
        console.log("IMDb.su search error: " + error);
        return JSON.stringify([]);
    }
}

async function extractDetails(url) {
    try {
        const title = parseTitleUrl(url);
        if (!title) return JSON.stringify([]);

        if (title.type === "tv") {
            const show = await getJson(TVMAZE_URL + "/lookup/shows?imdb=" + title.id);
            return JSON.stringify([{
                description: stripHtml(show.summary) || "No description available",
                aliases: "N/A",
                airdate: show.premiered || "Unknown"
            }]);
        }

        const data = await getJson(SUGGESTION_URL + title.id + ".json");
        const item = (data.d || []).find(entry => entry.id === title.id) || {};
        return JSON.stringify([{
            description: item.s || "No description available",
            aliases: "N/A",
            airdate: item.y ? String(item.y) : "Unknown"
        }]);
    } catch (error) {
        console.log("IMDb.su details error: " + error);
        return JSON.stringify([]);
    }
}

async function extractEpisodes(url) {
    try {
        const title = parseTitleUrl(url);
        if (!title) return JSON.stringify([]);
        if (title.type === "movie") {
            return JSON.stringify([{ href: titleUrl(title.id, "movie"), number: 1, title: "Full Movie" }]);
        }

        const show = await getJson(TVMAZE_URL + "/lookup/shows?imdb=" + title.id);
        const episodes = await getJson(TVMAZE_URL + "/shows/" + show.id + "/episodes");
        return JSON.stringify(episodes
            .filter(episode => episode.season > 0 && episode.number > 0)
            .map(episode => ({
                href: "https://player.imdb.su/embed/tv/" + title.id + "/" + episode.season + "/" + episode.number,
                number: episode.number,
                title: "S" + episode.season + " E" + episode.number + " - " + episode.name
            })));
    } catch (error) {
        console.log("IMDb.su episodes error: " + error);
        return JSON.stringify([]);
    }
}

async function extractStreamUrl(url) {
    try {
        const episode = url.match(/\/embed\/tv\/(tt\d{7,8})\/(\d+)\/(\d+)/i);
        const movie = url.match(/\/embed\/movie\/(tt\d{7,8})/i);
        if (!episode && !movie) return JSON.stringify({ streams: [], subtitles: "" });

        const params = movie
            ? "imdb=" + movie[1].toLowerCase() + "&type=movie"
            : "imdb=" + episode[1].toLowerCase() + "&type=tv&season=" + episode[2] + "&episode=" + episode[3];
        const data = await getJson(STREAM_URL + "?" + params, streamHeaders());
        const urls = data.data && Array.isArray(data.data.stream_urls) ? data.data.stream_urls : [];

        return JSON.stringify({
            streams: urls.map((streamUrl, index) => ({
                title: "IMDb.su Server " + (index + 1) + " (Adaptive HLS)",
                streamUrl: streamUrl,
                headers: streamHeaders()
            })),
            subtitles: ""
        });
    } catch (error) {
        console.log("IMDb.su stream error: " + error);
        return JSON.stringify({ streams: [], subtitles: "" });
    }
}
