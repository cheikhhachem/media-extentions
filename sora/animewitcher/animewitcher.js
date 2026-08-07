const BASE_URL = "https://www.animewitcher.com";
const FIRESTORE_URL = "https://firestore.googleapis.com/v1/projects/animewitcher-1c66d/databases/(default)/documents";
let ALGOLIA_APP_ID = "D8LH9I7ZL7";
let ALGOLIA_API_KEY = "b56c01ef52540ef334bcdbaa00ded9e4";

async function getJson(url, headers, method, body) {
    const response = await fetchv2(url, headers || {}, method || "GET", body);
    return response.json();
}

async function getText(url, referer) {
    const response = await fetchv2(url, referer ? { "Referer": referer } : {});
    return response.text();
}

function fieldValue(field) {
    if (!field) return null;
    if (field.stringValue !== undefined) return field.stringValue;
    if (field.integerValue !== undefined) return Number(field.integerValue);
    if (field.doubleValue !== undefined) return Number(field.doubleValue);
    if (field.booleanValue !== undefined) return field.booleanValue;
    return null;
}

async function refreshAlgoliaKeys() {
    try {
        const json = await getJson(FIRESTORE_URL + "/Settings/constants");
        const fields = json.fields.search_settings.mapValue.fields;
        ALGOLIA_APP_ID = fieldValue(fields.app_id_v3) || ALGOLIA_APP_ID;
        ALGOLIA_API_KEY = fieldValue(fields.api_key) || ALGOLIA_API_KEY;
    } catch (error) {
        console.log("AnimeWitcher key refresh error: " + error);
    }
}

async function algoliaSearch(query) {
    await refreshAlgoliaKeys();
    const attributes = ["objectID", "name", "poster_uri", "type", "details", "tags", "story", "english_title"];
    const params = "attributesToRetrieve=" + encodeURIComponent(JSON.stringify(attributes))
        + "&hitsPerPage=50&page=0&query=" + encodeURIComponent(query);
    return getJson(
        "https://" + ALGOLIA_APP_ID + "-dsn.algolia.net/1/indexes/series/query",
        {
            "X-Algolia-Application-Id": ALGOLIA_APP_ID,
            "X-Algolia-API-Key": ALGOLIA_API_KEY,
            "Content-Type": "application/json; charset=UTF-8"
        },
        "POST",
        JSON.stringify({ params: params })
    );
}

function animeId(url) {
    try {
        return decodeURIComponent(url.split("?")[0].replace(/\/$/, "").split("/").pop());
    } catch (_) {
        return url.split("?")[0].replace(/\/$/, "").split("/").pop();
    }
}

async function searchResults(keyword) {
    try {
        const json = await algoliaSearch(keyword);
        const results = (json.hits || []).filter((hit) => hit.name && hit.objectID).map((hit) => ({
            title: hit.name,
            image: hit.poster_uri || "",
            href: BASE_URL + "/watch/" + encodeURIComponent(hit.objectID)
        }));
        return JSON.stringify(results);
    } catch (error) {
        console.log("AnimeWitcher search error: " + error);
        return JSON.stringify([]);
    }
}

async function extractDetails(url) {
    try {
        await refreshAlgoliaKeys();
        const data = await getJson(
            "https://" + ALGOLIA_APP_ID + "-dsn.algolia.net/1/indexes/series/" + encodeURIComponent(animeId(url)),
            {
                "X-Algolia-Application-Id": ALGOLIA_APP_ID,
                "X-Algolia-API-Key": ALGOLIA_API_KEY
            }
        );
        const details = data.details || {};
        return JSON.stringify([{
            description: data.story || "No description available",
            aliases: Array.isArray(data.tags) ? data.tags.join(", ") : "N/A",
            airdate: details.year || details.start_date || "Unknown"
        }]);
    } catch (error) {
        console.log("AnimeWitcher details error: " + error);
        return JSON.stringify([]);
    }
}

async function extractEpisodes(url) {
    try {
        const id = animeId(url);
        const episodes = [];
        let pageToken = "";

        do {
            const endpoint = FIRESTORE_URL + "/anime_list/" + encodeURIComponent(id) + "/episodes?pageSize=300"
                + (pageToken ? "&pageToken=" + encodeURIComponent(pageToken) : "");
            const json = await getJson(endpoint);
            for (const document of json.documents || []) {
                const fields = document.fields || {};
                const episodeId = document.name.split("/").pop();
                const number = Number(fieldValue(fields.number)) || Number(episodeId) || episodes.length + 1;
                episodes.push({
                    href: id + "|" + episodeId,
                    number: number,
                    title: fieldValue(fields.name) || "الحلقة " + number,
                    image: fieldValue(fields.image) || fieldValue(fields.thumb_uri) || ""
                });
            }
            pageToken = json.nextPageToken || "";
        } while (pageToken);

        episodes.sort((a, b) => a.number - b.number);
        return JSON.stringify(episodes);
    } catch (error) {
        console.log("AnimeWitcher episodes error: " + error);
        return JSON.stringify([]);
    }
}

function serverFromFields(fields) {
    return {
        name: fieldValue(fields.name) || "Server",
        link: fieldValue(fields.link) || "",
        quality: fieldValue(fields.quality) || "",
        originalLink: fieldValue(fields.original_link) || "",
        visible: fieldValue(fields.visible) !== false
    };
}

async function episodeServers(id, episodeId) {
    const path = "/anime_list/" + encodeURIComponent(id) + "/episodes/" + encodeURIComponent(episodeId);
    try {
        const json = await getJson(FIRESTORE_URL + path + "/servers2/all_servers");
        const values = json.fields.servers.arrayValue.values || [];
        const servers = values.map((value) => serverFromFields(value.mapValue.fields)).filter((server) => server.visible && server.link);
        if (servers.length) return servers;
    } catch (_) {}

    const json = await getJson(FIRESTORE_URL + path + "/servers");
    return (json.documents || []).map((document) => serverFromFields(document.fields || {})).filter((server) => server.visible && server.link);
}

async function resolveKrakenFiles(server) {
    try {
        const words = await getJson(FIRESTORE_URL + "/Settings/servers/servers/KF");
        const word1 = fieldValue(words.fields.word1);
        const word2 = fieldValue(words.fields.word2);
        const html = await getText(server.link, BASE_URL + "/");
        if (!word1 || !word2 || !html.includes(word1)) return "";
        return "https://" + html.split(word1)[1].split(word2)[0].replace(/amp;/g, "").trim();
    } catch (_) {
        return "";
    }
}

async function extractStreamUrl(data) {
    try {
        const separator = data.indexOf("|");
        if (separator < 0) return JSON.stringify({ streams: [], subtitles: "" });
        const id = data.slice(0, separator);
        const episodeId = data.slice(separator + 1);
        const servers = await episodeServers(id, episodeId);
        const streams = [];

        servers.sort((a, b) => (Number((b.quality.match(/\d+/) || [0])[0])) - (Number((a.quality.match(/\d+/) || [0])[0])));
        for (const server of servers) {
            let streamUrl = "";
            const name = server.name.toUpperCase();
            if (name === "PD" && server.link.includes("/u/")) {
                streamUrl = "https://pixeldrain.com/api/file/" + server.link.split("/u/").pop().split(/[?#]/)[0];
            } else if (name === "KF") {
                streamUrl = await resolveKrakenFiles(server);
            } else if (/\.(?:mp4|m3u8)(?:[?#]|$)/i.test(server.originalLink || server.link)) {
                streamUrl = server.originalLink || server.link;
            }

            if (streamUrl && !streams.some((stream) => stream.streamUrl === streamUrl)) {
                streams.push({
                    title: "AnimeWitcher " + server.name + " " + (server.quality || "Auto"),
                    streamUrl: streamUrl,
                    headers: name === "KF" ? { "Referer": "https://krakenfiles.com/" } : {}
                });
            }
        }

        return JSON.stringify({ streams: streams, subtitles: "" });
    } catch (error) {
        console.log("AnimeWitcher stream error: " + error);
        return JSON.stringify({ streams: [], subtitles: "" });
    }
}
