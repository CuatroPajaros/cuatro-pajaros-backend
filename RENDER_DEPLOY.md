# Cuatro Pájaros Backend - Render Deployment

## Quick Deploy Instructions

1. **Download this folder as ZIP**
2. **Go to https://render.com and login**
3. **Click "New +" → "Web Service"**
4. **Select "Public Git repository"** (or upload ZIP directly)
5. **Set these values:**
   - Name: `cuatro-pajaros-backend`
   - Build Command: `npm install`
   - Start Command: `node server.js`
   - Environment: Node
   - Plan: Free

6. **Add Environment Variables:**
   - `MONGODB_URI`: `mongodb+srv://CuatroPajarosDB:4pajaros4@cluster0.5lf1aqb.mongodb.net/cuatro-pajaros?retryWrites=true&w=majority`
   - `NODE_ENV`: `production`
   - `PORT`: `3000`
   - `CORS_ORIGIN`: `*`

7. **Click "Deploy"**

## API Endpoints

Once deployed, you'll get a public URL like:
`https://cuatro-pajaros-backend.onrender.com`

Test with:
`https://your-url.onrender.com/api/products`

## Notes

- First deploy takes 3-5 minutes
- Free plan will sleep after 15 minutes of inactivity (wakes up automatically)
- MongoDB connection uses MongoDB Atlas (already configured)
