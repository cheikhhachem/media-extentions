const mangayomiSources = [{
    name: "Okanime",
    lang: "ar",
    baseUrl: "https://ww3.okanime.xyz",
    apiUrl: "",
    iconUrl: "https://ww3.okanime.xyz/assets/img/logos/okanime-128.png",
    typeSource: "single",
    itemType: 1,
    isNsfw: false,
    version: "1.0.0",
    pkgPath: "anime/src/ar/okanime.js"
}];

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
        this.userAgent = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36";
    }

    async html(url, referer = this.source.baseUrl + "/") {
        return (await this.client.get(url, { "User-Agent": this.userAgent, Referer: referer })).body;
    }

    text(value) {
        return (value || "").replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").trim();
    }

    absolute(url) {
        return url.startsWith("http") ? url : this.source.baseUrl + (url.startsWith("/") ? url : "/" + url);
    }

    parseList(html) {
        const list = [];
        const pattern = /<div class="anime-card anime-hover">[\s\S]*?<img[^>]+src="([^"]+)"[^>]+alt="([^"]+)"[\s\S]*?<a href="([^"]*\/anime\/[^\"]+)" class="clickable"/g;
        let match;
        while ((match = pattern.exec(html)) !== null) {
            list.push({
                link: this.absolute(match[3]),
                imageUrl: this.absolute(match[1]),
                name: this.text(match[2]).replace(/\s*\|.*$/, "")
            });
        }
        return list;
    }

    async results(query) {
        const html = await this.html(this.source.baseUrl + "/anime-list?q=" + encodeURIComponent(query));
        return { list: this.parseList(html), hasNextPage: false };
    }

    async getPopular(page) {
        return this.results("");
    }

    async getLatestUpdates(page) {
        return this.results("");
    }

    async search(query, page, filters) {
        return this.results(query);
    }

    async getDetail(url) {
        const html = await this.html(url);
        const description = this.text((html.match(/<div class="synopsis-text"[^>]*>([\s\S]*?)<\/div>/) || [null, ""])[1]);
        const genres = [];
        const genrePattern = /<a[^>]+class="genre-tag"[^>]*>([\s\S]*?)<\/a>/g;
        let genre;
        while ((genre = genrePattern.exec(html)) !== null) genres.push(this.text(genre[1]));

        const episodes = [];
        const episodePattern = /<a href="([^"]*\/episode\/[^\"]+)"\s+class="ep-compact-btn[^\"]*"\s+title="[^\"]*?(\d+)">/g;
        let episode;
        while ((episode = episodePattern.exec(html)) !== null) {
            episodes.push({ name: "Episode " + episode[2], url: this.absolute(episode[1]) });
        }
        return { description: description, genre: genres, episodes: episodes.reverse() };
    }

    unpack(source) {
        const match = /}\('(.+)',\s*(\d+),\s*(\d+),\s*'(.+)'\.split\('\|'\)/.exec(source);
        if (!match) return "";
        const radix = Number(match[2]);
        const symbols = match[4].split("|");
        const alphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
        const decode = value => radix <= 36
            ? parseInt(value, radix)
            : value.split("").reduce((total, character) => total * radix + alphabet.indexOf(character), 0);
        return match[1].replace(/\b\w+\b/g, word => symbols[decode(word)] || word);
    }

    streamFromEmbed(html) {
        const packed = html.match(/eval\(function\(p,a,c,k,e,d\)[\s\S]*?\.split\('\|'\)\)\)/);
        const source = packed ? this.unpack(packed[0]) : html;
        const match = source.match(/(?:file|src)\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)/i)
            || source.match(/["'](https?:[^"']+\.(?:m3u8|mp4)[^"']*)["']/i);
        return match ? match[1].replace(/\\\//g, "/").replace(/&amp;/g, "&") : "";
    }

    async getVideoList(url) {
        const html = await this.html(url);
        const videos = [];
        const pattern = /data-server="([^"]+)"[\s\S]*?@click="setServer\('([^']+)'\)"[\s\S]*?<span>([^<]+)<\/span>/g;
        let match;
        while ((match = pattern.exec(html)) !== null) {
            try {
                const embedUrl = match[2].replace(/&amp;/g, "&");
                if (embedUrl.includes("mp4upload.com")) {
                    const extracted = await mp4UploadExtractor(embedUrl);
                    for (const video of extracted) {
                        video.quality = "Mp4Upload " + match[3].trim() + (video.quality ? " " + video.quality : "");
                        videos.push(video);
                    }
                    continue;
                }
                const streamUrl = this.streamFromEmbed(await this.html(embedUrl, url));
                if (streamUrl && !videos.some(video => video.url === streamUrl)) {
                    videos.push({
                        url: streamUrl,
                        originalUrl: streamUrl,
                        quality: match[1] + " " + match[3].trim(),
                        headers: { Referer: embedUrl, "User-Agent": this.userAgent }
                    });
                }
            } catch (error) {
                console.log("Okanime provider unavailable: " + error);
            }
        }
        return videos;
    }
}
