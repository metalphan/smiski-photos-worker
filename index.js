async function getSecrets(env) {
    const refreshToken = await env.SECRETS.get("REFRESH_TOKEN");
    const clientId = await env.SECRETS.get("CLIENT_ID");
    const clientSecret = await env.SECRETS.get("CLIENT_SECRET");

    console.log("Retrieved secrets:", { refreshToken, clientId, clientSecret }); // Debugging log

    if (!refreshToken || !clientId || !clientSecret) {
        throw new Error("Missing Google API secrets in KV");
    }

    return { refreshToken, clientId, clientSecret };
}

  
  async function refreshToken(env) {
	const { refreshToken, clientId, clientSecret } = await getSecrets(env);
  
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
	  throw new Error("Failed to refresh Google API token");
	}
  
	const data = await response.json();
	return data.access_token;
  }
  
  async function updatePhotos(env) {
	const accessToken = await refreshToken(env);
	const albumId = "ALbRIU_103UAj7do5yTn8_h49i8AlymjoWa6Oa9UQFMRYr9uM_aWe5r3QP1o4C3dLSAFdcVFshRz4wD3gvrQLJe6PxNPsWml3w";
	const apiUrl = `https://photoslibrary.googleapis.com/v1/mediaItems:search`;
  
	const response = await fetch(apiUrl, {
	  method: "POST",
	  headers: {
		Authorization: `Bearer ${accessToken}`,
		"Content-Type": "application/json",
	  },
	  body: JSON.stringify({ albumId }),
	});
  
	if (!response.ok) {
	  throw new Error(`Error fetching photos: ${response.statusText}`);
	}
  
	const data = await response.json();
  
	for (const item of data.mediaItems) {
	  await env.IMAGE_LINKS.put(item.id, JSON.stringify({
		url: item.baseUrl,
		filename: item.filename,
	  }));
	}
  }
  
  export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        if (url.pathname === "/photos") {
            // Fetch photo metadata from KV
            const images = await env.IMAGE_LINKS.list();
            const photos = images.keys.map((key) => {
                return {
                    url: `https://smiski-travel.us/proxy/${key.name}`,
                    filename: key.name,
                };
            });

            return new Response(JSON.stringify(photos), {
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                },
            });
        }

		if (url.pathname.startsWith("/proxy/")) {
			const photoId = url.pathname.split("/proxy/")[1];
			console.log(`Fetching photo with ID: ${photoId}`);
		  
			const accessToken = await refreshToken(env);
			console.log(`Access token: ${accessToken}`);
		  
			const googlePhotosUrl = `https://photoslibrary.googleapis.com/v1/mediaItems/${photoId}`;
			console.log(`Google Photos API URL: ${googlePhotosUrl}`);
		  
			const response = await fetch(googlePhotosUrl, {
			  headers: {
				Authorization: `Bearer ${accessToken}`,
			  },
			});
		  
			if (!response.ok) {
			  console.error(`Error fetching image: ${response.statusText}`);
			  return new Response(`Error fetching image: ${response.statusText}`, { status: response.status });
			}
		  
			const data = await response.json();
			console.log(`Google Photos API Response: ${JSON.stringify(data)}`);
		  
			// Validate if `baseUrl` exists
			if (!data.baseUrl) {
			  console.error("Base URL missing in API response");
			  return new Response("Base URL missing in API response", { status: 500 });
			}
		  
			const imageUrl = `${data.baseUrl}=w${data.mediaMetadata.width}-h${data.mediaMetadata.height}`;
			console.log(`Resolved Image URL: ${imageUrl}`);
		  
			// Fetch the actual image
			const imageResponse = await fetch(imageUrl);
		  
			if (!imageResponse.ok) {
			  console.error(`Error fetching image from baseUrl: ${imageResponse.statusText}`);
			  return new Response(`Error fetching image from baseUrl: ${imageResponse.statusText}`, { status: imageResponse.status });
			}
		  
			console.log("Image fetched successfully, returning response");
			return new Response(imageResponse.body, {
			  headers: {
				"Content-Type": imageResponse.headers.get("Content-Type"),
				"Cache-Control": "public, max-age=3600",
			  },
			});
		  }
		  

        return new Response("Not Found", { status: 404 });
    },
};
