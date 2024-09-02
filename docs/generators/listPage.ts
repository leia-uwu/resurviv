export default function generateListPage<T>(
    path: string,
    list: Record<string, any>,
    key: T,
): string {
    let buffer = "";

    buffer += "<ul>";

    for (const [type, name] of Object.entries(list)) {
        buffer += "<li>";
        buffer += `<a href="${path}${type}">`;
        buffer += name[key];
        buffer += "</a>";
        buffer += "</li>";
    }

    buffer += "</ul>";

    return buffer;
}
