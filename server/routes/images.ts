import { Router } from 'express';

const router = Router();

// GET /api/places/photo?name=places/xxx/photos/yyy&maxWidth=400
// Proxies Google Places photos to hide the API key from the client.
// The client never sees GOOGLE_PLACES_API_KEY -- it only calls this endpoint.
router.get('/places/photo', async (req, res, next) => {
  try {
    const { name, maxWidth = '400' } = req.query as Record<string, string>;

    // Validate required param
    if (!name) {
      return res.status(400).json({ error: 'name query parameter is required' });
    }

    // Validate API key is available
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      return res
        .status(503)
        .json({ error: 'Google Places API is not configured' });
    }

    // Construct Google Places photo media URL
    const url = `https://places.googleapis.com/v1/${name}/media?maxWidthPx=${maxWidth}&key=${apiKey}`;

    // Fetch with redirect follow (Google redirects to actual image)
    const response = await fetch(url, { redirect: 'follow' });

    if (!response.ok) {
      return res
        .status(response.status)
        .json({ error: 'Photo fetch failed' });
    }

    // Stream the image to the client
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    // Browser caches for 1 hour -- reduces repeat requests within session
    res.setHeader('Cache-Control', 'public, max-age=3600');

    const buffer = Buffer.from(await response.arrayBuffer());
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

export default router;
