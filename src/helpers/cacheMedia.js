export default async function cacheMedia(url) {
        if (!url) return null;
        if (url.includes("blob:") && !url.startsWith("blob:")) {
                return `blob:${url.split("blob:")[1]}`;
        }
        return url;
}
