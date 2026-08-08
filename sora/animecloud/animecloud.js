const API_URL = "https://khkhkhkh.com/animecp/animeapi65/";
const API_HEADERS = {
    "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
    "User-Agent": "AnimeCloud/1.0 iOS"
};

async function api(command, fields) {
    const values = Object.assign({ command: command }, fields || {});
    const body = Object.keys(values).map((key) => encodeURIComponent(key) + "=" + encodeURIComponent(values[key])).join("&");
    const response = await fetchv2(API_URL, API_HEADERS, "POST", body);
    return response.json();
}

function animeId(url) {
    return String(url).split("?")[0].replace(/\/$/, "").split("/").pop();
}

async function searchResults(keyword) {
    try {
        const json = await api("getAllAnime", { cmode: "0", hiddenMode: "1" });
        const query = keyword.trim().toLocaleLowerCase();
        const results = (json.result || []).filter((anime) => {
            return (anime.name + " " + (anime.keywords || "") + " " + (anime.year || "")).toLocaleLowerCase().includes(query);
        }).slice(0, 50).map((anime) => ({
            title: anime.name,
            image: anime.image || "",
            href: "https://animecloudapp.com/anime/" + anime.id
        }));
        return JSON.stringify(results);
    } catch (error) {
        console.log("Anime Cloud search error: " + error);
        return JSON.stringify([]);
    }
}

async function extractDetails(url) {
    try {
        const id = animeId(url);
        const responses = await Promise.all([
            api("getAnimeDetails", { animeID: id }),
            api("getAnimeMoreDetails", { animeID: id })
        ]);
        const summary = (responses[0].mainResult || [])[0] || {};
        const more = (responses[1].result || [])[0] || {};
        return JSON.stringify([{
            description: more.story || "No description available",
            aliases: more.genres || "N/A",
            airdate: [more.year, more.status, summary.age, summary.rank ? "Rating: " + summary.rank : ""].filter(Boolean).join(" | ") || "Unknown"
        }]);
    } catch (error) {
        console.log("Anime Cloud details error: " + error);
        return JSON.stringify([]);
    }
}

async function extractEpisodes(url) {
    try {
        const json = await api("getAnimeDetails", { animeID: animeId(url) });
        const episodes = (json.result || []).map((episode, index) => {
            const match = episode.name && episode.name.match(/\d+(?:\.\d+)?/);
            return {
                href: String(episode.id),
                number: match ? Number(match[0]) : index + 1,
                title: episode.name || "Episode " + (index + 1),
                image: episode.image300 || episode.image170 || ""
            };
        });
        episodes.sort((a, b) => a.number - b.number);
        return JSON.stringify(episodes);
    } catch (error) {
        console.log("Anime Cloud episodes error: " + error);
        return JSON.stringify([]);
    }
}

async function decryptPlayback(payload) {
    const encrypted = Uint8Array.from(atob(payload.trim().replace(/^"|"$/g, "")), (character) => character.charCodeAt(0));
    if (encrypted[0] !== 3 || encrypted.length < 67) throw new Error("Invalid playback payload");
    const material = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode("anime5w&f4H&434*"),
        "PBKDF2",
        false,
        ["deriveKey"]
    );
    const key = await crypto.subtle.deriveKey(
        { name: "PBKDF2", salt: encrypted.slice(2, 10), iterations: 10000, hash: "SHA-1" },
        material,
        { name: "AES-CBC", length: 256 },
        false,
        ["decrypt"]
    );
    const plaintext = await crypto.subtle.decrypt(
        { name: "AES-CBC", iv: encrypted.slice(18, 34) },
        key,
        encrypted.slice(34, -32)
    );
    const json = JSON.parse(new TextDecoder().decode(plaintext));
    const source = (json.result || [])[0] || json;
    if (!source.url) throw new Error("No playable source returned");
    return source.url;
}

async function encryptedStreamUrl(payload) {
    if (typeof crypto !== "undefined" && crypto.subtle) return decryptPlayback(payload);
    if (typeof networkFetchSimpleFromHTML !== "function") throw new Error("Playback decryption is unavailable");

    const html = "<script>(" + decryptPlayback.toString() + ")(" + JSON.stringify(payload) + ").then(function(url){"
        + "window.webkit.messageHandlers.networkLogger.postMessage({url:url})"
        + "})<\/script>";
    const result = await networkFetchSimpleFromHTML(html, { timeoutSeconds: 2 });
    return (result.requests || []).find((request) => /\/uploads2\/.*(?:token|expires)=/i.test(request)) || "";
}

async function extractStreamUrl(episodeId) {
    const streams = [];
    for (const quality of ["1", "2"]) {
        try {
            const response = await fetchv2(
                API_URL,
                API_HEADERS,
                "POST",
                "command=getVideoURL&epID=" + encodeURIComponent(episodeId) + "&quality=" + quality
            );
            const payload = (await response.text()).trim();
            let streamUrl = "";
            try {
                const json = JSON.parse(payload);
                streamUrl = ((json.result || [])[0] || json).url || "";
            } catch (_) {
                streamUrl = await encryptedStreamUrl(payload);
            }
            if (streamUrl && !streams.some((stream) => stream.streamUrl === streamUrl)) {
                streams.push({
                    title: "Anime Cloud " + (quality === "1" ? "HD" : "SD"),
                    streamUrl: streamUrl,
                    headers: {}
                });
            }
        } catch (error) {
            console.log("Anime Cloud quality " + quality + " error: " + error);
        }
    }
    return JSON.stringify({ streams: streams, subtitles: "" });
}
