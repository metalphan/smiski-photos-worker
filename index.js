async function getSecrets(env) {
    const refreshToken = await env.SECRETS.get("REFRESH_TOKEN");
    const clientId = await env.SECRETS.get("CLIENT_ID");
    const clientSecret = await env.SECRETS.get("CLIENT_SECRET");

    console.log("Secrets fetched:", { refreshToken, clientId, clientSecret });

    if (!refreshToken || !clientId || !clientSecret) {
        throw new Error("Missing Google API secrets in KV");
    }

    return { refreshToken, clientId, clientSecret };
}

async function refreshToken(env) {
    const { refreshToken, clientId, clientSecret } = await getSecrets(env);
    console.log("Refreshing token with:", { refreshToken, clientId, clientSecret });

    const tokenUrl = "https://oauth2.googleapis.com/token";
    const params = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
    });

    const response = await fetch(tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
    });

    if (!response.ok) {
        console.error("Failed to refresh Google API token", await response.text());
        throw new Error("Failed to refresh Google API token");
    }

    const data = await response.json();
    console.log("Token refreshed successfully:", data);
    return data.access_token;
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        // Serve admin.html
        if (url.pathname === "/admin.html") {
            return new Response(
                `<!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Admin Page</title>
                </head>
                <body>
                    <h1>Admin Page</h1>
                    <button id="refresh-token">Refresh Token</button>
                    <p id="status"></p>
                    <script>
                        document.getElementById('refresh-token').addEventListener('click', async () => {
                            const statusElement = document.getElementById('status');
                            statusElement.textContent = 'Refreshing token...';
                            try {
                                const response = await fetch('/admin');
                                if (response.ok) {
                                    const result = await response.text();
                                    statusElement.textContent = result;
                                } else {
                                    statusElement.textContent = \`Error refreshing token: \${response.statusText}\`;
                                }
                            } catch (error) {
                                statusElement.textContent = \`Error: \${error.message}\`;
                            }
                        });
                    </script>
                </body>
                </html>`,
                { headers: { "Content-Type": "text/html" } }
            );
        }

        // Refresh token at /admin route
        if (url.pathname === "/admin") {
            console.log("Admin endpoint hit");
            try {
                const newToken = await refreshToken(env);
                console.log("New token:", newToken);
                return new Response("Token refreshed successfully!", {
                    headers: { "Content-Type": "text/plain" },
                });
            } catch (error) {
                console.error("Error refreshing token:", error);
                return new Response(`Error refreshing token: ${error.message}`, {
                    status: 500,
                    headers: { "Content-Type": "text/plain" },
                });
            }
        }

        // Handle /photos endpoint
        if (url.pathname === "/photos") {
            console.log("Photos endpoint hit");
            const images = await env.IMAGE_LINKS.list();
            console.log("Images retrieved:", images);
            const photos = images.keys.map((key) => ({
                url: `https://smiski-travel.us/proxy/${key.name}`,
                filename: key.name,
            }));

            return new Response(JSON.stringify(photos), {
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                },
            });
        }

        // Handle /proxy/{photoId} endpoint
        if (url.pathname.startsWith("/proxy/")) {
            console.log("Proxy endpoint hit");
            const photoId = url.pathname.split("/proxy/")[1];
            console.log("Photo ID:", photoId);
            const accessToken = await refreshToken(env);

            const googlePhotosUrl = `https://photoslibrary.googleapis.com/v1/mediaItems/${photoId}`;
            const response = await fetch(googlePhotosUrl, {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            });

            if (!response.ok) {
                console.error("Error fetching image metadata", await response.text());
                return new Response("Error fetching image metadata", {
                    status: response.status,
                });
            }

            const data = await response.json();
            console.log("Image metadata:", data);
            if (!data.baseUrl) {
                console.error("Base URL missing in API response");
                return new Response("Base URL missing in API response", { status: 500 });
            }

            const imageUrl = `${data.baseUrl}=w${data.mediaMetadata.width}-h${data.mediaMetadata.height}`;
            const imageResponse = await fetch(imageUrl);

            if (!imageResponse.ok) {
                console.error("Error fetching image", await imageResponse.text());
                return new Response("Error fetching image", {
                    status: imageResponse.status,
                });
            }

            console.log("Image fetched successfully");
            return new Response(imageResponse.body, {
                headers: {
                    "Content-Type": imageResponse.headers.get("Content-Type"),
                    "Cache-Control": "public, max-age=3600",
                },
            });
        }

        // Default response for unhandled routes
        return new Response("Not Found", { status: 404 });
    },
};
