async function getSecrets(env) {
	const refreshToken = await env.SECRETS.get("REFRESH_TOKEN");
	const clientId = await env.SECRETS.get("CLIENT_ID");
	const clientSecret = await env.SECRETS.get("CLIENT_SECRET");
  
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
	  if (request.method === "POST") {
		await updatePhotos(env);
		return new Response("Photo data updated successfully in KV!", { status: 200 });
	  }
  
	  if (request.method === "GET") {
		const keys = await env.IMAGE_LINKS.list();
		const images = [];
  
		for (const key of keys.keys) {
		  const value = await env.IMAGE_LINKS.get(key.name);
		  images.push(JSON.parse(value));
		}
  
		return new Response(JSON.stringify(images), {
		  headers: { "Content-Type": "application/json" },
		});
	  }
  
	  return new Response("Invalid method", { status: 405 });
	},
  };
  