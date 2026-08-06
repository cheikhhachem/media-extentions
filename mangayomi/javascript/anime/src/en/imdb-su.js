const mangayomiSources = [{
    name: "IMDb.su",
    lang: "en",
    baseUrl: "https://imdb.su",
    apiUrl: "https://streamdata.vaplayer.ru",
    iconUrl: "https://raw.githubusercontent.com/cheikhhachem/media-extentions/master/sora/imdb-su/icon.png",
    typeSource: "single",
    itemType: 1,
    isNsfw: false,
    version: "1.0.0",
    pkgPath: "anime/src/en/imdb-su.js"
}];

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
        this.userAgent = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36";
    }

    async json(url, headers = { "User-Agent": this.userAgent }) {
        return JSON.parse((await this.client.get(url, headers)).body);
    }

    isSeries(item) {
        return /series/i.test(item.qid || "") || /series/i.test(item.q || "");
    }

    async find(query) {
        const data = await this.json("https://v3.sg.media-imdb.com/suggestion/x/" + encodeURIComponent(query) + ".json");
        return (data.d || []).filter(item => /^tt\d{7,8}$/i.test(item.id || "")).map(item => ({
            link: "https://player.imdb.su/embed/" + (this.isSeries(item) ? "tv" : "movie") + "/" + item.id,
            name: item.l || item.id,
            imageUrl: item.i?.imageUrl || ""
        }));
    }

    async getPopular(page) {
        return { list: await this.find("popular"), hasNextPage: false };
    }

    async getLatestUpdates(page) {
        return { list: await this.find("new"), hasNextPage: false };
    }

    async search(query, page, filters) {
        return { list: await this.find(query), hasNextPage: false };
    }

    async getDetail(url) {
        const match = url.match(/\/embed\/(movie|tv)\/(tt\d{7,8})/i);
        if (!match) return { episodes: [] };
        const type = match[1].toLowerCase();
        const imdb = match[2].toLowerCase();

        if (type === "movie") {
            const data = await this.json("https://v3.sg.media-imdb.com/suggestion/x/" + imdb + ".json");
            const item = (data.d || []).find(entry => entry.id === imdb) || {};
            return {
                name: item.l || imdb,
                imageUrl: item.i?.imageUrl || "",
                description: item.s || "",
                episodes: [{ name: "Movie", url: url }]
            };
        }

        const show = await this.json("https://api.tvmaze.com/lookup/shows?imdb=" + imdb);
        const episodes = await this.json("https://api.tvmaze.com/shows/" + show.id + "/episodes");
        return {
            name: show.name || imdb,
            imageUrl: show.image?.original || show.image?.medium || "",
            description: (show.summary || "").replace(/<[^>]*>/g, "").trim(),
            genre: show.genres || [],
            episodes: episodes.filter(ep => ep.season > 0 && ep.number > 0).map(ep => ({
                name: "S" + ep.season + " E" + ep.number + " - " + ep.name,
                url: "https://player.imdb.su/embed/tv/" + imdb + "/" + ep.season + "/" + ep.number
            })).reverse()
        };
    }

    async getVideoList(url) {
        const episode = url.match(/\/embed\/tv\/(tt\d{7,8})\/(\d+)\/(\d+)/i);
        const movie = url.match(/\/embed\/movie\/(tt\d{7,8})/i);
        if (!episode && !movie) return [];

        const query = movie
            ? "imdb=" + movie[1].toLowerCase() + "&type=movie"
            : "imdb=" + episode[1].toLowerCase() + "&type=tv&season=" + episode[2] + "&episode=" + episode[3];
        const headers = {
            Referer: "https://nextgencloudfabric.com/",
            Origin: "https://nextgencloudfabric.com",
            "User-Agent": this.userAgent
        };
        const data = await this.json("https://streamdata.vaplayer.ru/api.php?" + query, headers);
        return (data.data?.stream_urls || []).map((streamUrl, index) => ({
            url: streamUrl,
            originalUrl: streamUrl,
            quality: "IMDb.su Server " + (index + 1) + " (Adaptive HLS)",
            headers: headers
        }));
    }
}
