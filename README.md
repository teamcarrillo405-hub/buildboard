# ConstructFlix

A Netflix-style construction company directory built with React, TypeScript, and Tailwind CSS.

## Features

- **Netflix-inspired UI**: Dark theme with red accents, horizontal scrolling content rails
- **Company Directory**: Browse 268+ construction companies across multiple categories
- **Advanced Filtering**: Filter by category, location, rating, and more
- **Search**: Real-time search with suggestions
- **Responsive Design**: Works on desktop, tablet, and mobile
- **Animations**: Smooth transitions powered by Framer Motion

## Tech Stack

- **Frontend**: React 18 + TypeScript
- **Styling**: Tailwind CSS
- **Animations**: Framer Motion
- **Icons**: Lucide React
- **Build Tool**: Vite
- **Routing**: React Router DOM

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm 9+

### Installation

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

3. Open your browser and navigate to `http://localhost:3000`

### Build for Production

```bash
npm run build
```

The built files will be in the `dist` directory.

## Project Structure

```
construction-directory-final/
├── public/
│   ├── database.json          # Company data (268 companies)
│   └── constructflix-icon.svg # App icon
├── src/
│   ├── api/
│   │   ├── types.ts           # TypeScript type definitions
│   │   ├── api.ts             # Mock API functions
│   │   ├── hooks.ts           # React hooks for data fetching
│   │   └── filters.ts         # Filter utility functions
│   ├── components/
│   │   ├── Navigation.tsx     # Top navigation bar
│   │   ├── Footer.tsx         # Footer component
│   │   ├── HeroSection.tsx    # Hero carousel
│   │   ├── FilterBar.tsx      # Filter controls
│   │   ├── CompanyCard.tsx    # Company card component
│   │   ├── ContentRail.tsx    # Horizontal scrolling rail
│   │   └── DetailModal.tsx    # Company detail modal
│   ├── layouts/
│   │   └── MainLayout.tsx     # Main page layout
│   ├── pages/
│   │   └── Home.tsx           # Home page
│   ├── App.tsx                # Main app component
│   ├── main.tsx               # Entry point
│   └── index.css              # Global styles
├── index.html
├── package.json
├── vite.config.ts
├── tailwind.config.js
└── tsconfig.json
```

## Features Overview

### Navigation
- Fixed header with scroll effect
- Search functionality
- Mobile-responsive menu

### Hero Section
- Auto-rotating featured companies
- Company details overlay
- Call-to-action buttons

### Content Rails
- Horizontal scrolling company cards
- Multiple variants (default, compact, featured)
- Rank display for top-rated companies

### Filtering
- Category filter
- Location filter
- Rating filter
- Additional filters (subcategory, services, featured, new)

### Company Cards
- Image with hover zoom effect
- Rating and review count
- Services preview
- Quick contact buttons
- Expandable details

### Detail Modal
- Full company information
- Tabs for overview, services, and hours
- Similar companies section
- Contact buttons

## Data

The application uses a mock database with 268 construction companies across 15 categories:

- General Contracting
- Residential Construction
- Commercial Construction
- Industrial Construction
- Renovation & Remodeling
- Electrical Services
- Plumbing Services
- HVAC Services
- Roofing Services
- Concrete & Masonry
- Painting & Finishing
- Landscaping & Outdoor
- Specialty Contracting
- Design-Build Services
- Green Building & Sustainability

## Customization

### Colors

Edit `tailwind.config.js` to customize the color scheme:

```javascript
colors: {
  netflix: {
    red: '#E50914',
    'red-dark': '#B20710',
    black: '#141414',
    // ...
  }
}
```

### Adding Companies

Edit `public/database.json` to add or modify companies. Each company should follow this structure:

```json
{
  "id": "comp-001",
  "businessName": "Company Name",
  "category": "Category Name",
  "subCategory": "Subcategory",
  "location": "City, ST",
  "state": "ST",
  "city": "City",
  "rating": 4.5,
  "reviewCount": 100,
  "website": "https://example.com",
  "phone": "(555) 123-4567",
  "hours": {
    "monday": "8:00 AM - 5:00 PM",
    "tuesday": "8:00 AM - 5:00 PM",
    "wednesday": "8:00 AM - 5:00 PM",
    "thursday": "8:00 AM - 5:00 PM",
    "friday": "8:00 AM - 5:00 PM",
    "saturday": "Closed",
    "sunday": "Closed"
  },
  "services": ["Service 1", "Service 2"],
  "reviewSummary": "Company description...",
  "imageUrl": "https://example.com/image.jpg",
  "videoUrl": null,
  "isFeatured": true,
  "isNew": false,
  "popularityScore": 99,
  "yearFounded": 2000,
  "employeeCount": "50-100"
}
```

## License

MIT
