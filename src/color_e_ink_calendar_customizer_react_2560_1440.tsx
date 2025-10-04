import React, { useMemo, useRef, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Download, Settings2, Calendar, Wifi } from "lucide-react";
// NOTE: For PNG export, ensure html-to-image is available in your environment
// npm i html-to-image --save
import * as htmlToImage from "html-to-image";
import { CalDAVService, CalendarEvent, calDAVService } from "./services/caldav";

/**
 * Color E‑Ink Calendar Customizer
 * - Hybrid layout: Month grid (left) + Agenda (right)
 * - Exact render size: 2560×1440 with 64px safe margins
 * - Color‑aware accents, bold readable type
 */

// --- Utilities
const pad2 = (n: number) => String(n).padStart(2, "0");

type EventItem = {
  id: string;
  title: string;
  start: Date;
  end?: Date;
  allDay?: boolean;
  location?: string;
  category: keyof Palette["categories"]; // work | personal | health | social | family | school | sports | reminder
};

// Generate a simple month matrix (5 weeks view - 35 days)
function getMonthMatrix(year: number, month: number) {
  // month: 0-11
  const firstOfMonth = new Date(year, month, 1);
  const startDay = firstOfMonth.getDay(); // Sun=0..Sat=6
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();

  const cells: { date: Date; inMonth: boolean }[] = [];
  // Leading days from prev month
  for (let i = 0; i < startDay; i++) {
    const d = prevMonthDays - (startDay - 1 - i);
    cells.push({ date: new Date(year, month - 1, d), inMonth: false });
  }
  // Month days
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(year, month, d), inMonth: true });
  }
  // Trailing to fill 35 cells (5 weeks)
  while (cells.length < 35) {
    const nextDay = cells.length - (startDay + daysInMonth) + 1;
    cells.push({ date: new Date(year, month + 1, nextDay), inMonth: false });
  }
  return cells;
}

// Group events by YYYY-MM-DD for grid & agenda
function ymd(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// Comprehensive Google Fonts collection (organized by categories)
const GOOGLE_FONTS = [
  // === SYSTEM FONTS ===
  { name: "Arial", value: "Arial, sans-serif", category: "System" },
  { name: "Times New Roman", value: "Times New Roman, serif", category: "System" },
  { name: "Georgia", value: "Georgia, serif", category: "System" },
  { name: "Helvetica", value: "Helvetica, sans-serif", category: "System" },
  { name: "Verdana", value: "Verdana, sans-serif", category: "System" },
  
  // === POPULAR SANS-SERIF ===
  { name: "Inter", value: "Inter, sans-serif", category: "Sans-serif" },
  { name: "Roboto", value: "Roboto, sans-serif", category: "Sans-serif" },
  { name: "Open Sans", value: "Open Sans, sans-serif", category: "Sans-serif" },
  { name: "Lato", value: "Lato, sans-serif", category: "Sans-serif" },
  { name: "Montserrat", value: "Montserrat, sans-serif", category: "Sans-serif" },
  { name: "Poppins", value: "Poppins, sans-serif", category: "Sans-serif" },
  { name: "Nunito", value: "Nunito, sans-serif", category: "Sans-serif" },
  { name: "Source Sans Pro", value: "Source Sans Pro, sans-serif", category: "Sans-serif" },
  { name: "Ubuntu", value: "Ubuntu, sans-serif", category: "Sans-serif" },
  { name: "Raleway", value: "Raleway, sans-serif", category: "Sans-serif" },
  { name: "Work Sans", value: "Work Sans, sans-serif", category: "Sans-serif" },
  { name: "Fira Sans", value: "Fira Sans, sans-serif", category: "Sans-serif" },
  { name: "PT Sans", value: "PT Sans, sans-serif", category: "Sans-serif" },
  { name: "Noto Sans", value: "Noto Sans, sans-serif", category: "Sans-serif" },
  { name: "Droid Sans", value: "Droid Sans, sans-serif", category: "Sans-serif" },
  { name: "Oxygen", value: "Oxygen, sans-serif", category: "Sans-serif" },
  { name: "Arimo", value: "Arimo, sans-serif", category: "Sans-serif" },
  { name: "Karla", value: "Karla, sans-serif", category: "Sans-serif" },
  { name: "Mulish", value: "Mulish, sans-serif", category: "Sans-serif" },
  { name: "DM Sans", value: "DM Sans, sans-serif", category: "Sans-serif" },
  { name: "Quicksand", value: "Quicksand, sans-serif", category: "Sans-serif" },
  { name: "Barlow", value: "Barlow, sans-serif", category: "Sans-serif" },
  { name: "Public Sans", value: "Public Sans, sans-serif", category: "Sans-serif" },
  { name: "Red Hat Display", value: "Red Hat Display, sans-serif", category: "Sans-serif" },
  { name: "IBM Plex Sans", value: "IBM Plex Sans, sans-serif", category: "Sans-serif" },
  { name: "Rubik", value: "Rubik, sans-serif", category: "Sans-serif" },
  { name: "Manrope", value: "Manrope, sans-serif", category: "Sans-serif" },
  { name: "Plus Jakarta Sans", value: "Plus Jakarta Sans, sans-serif", category: "Sans-serif" },
  { name: "Outfit", value: "Outfit, sans-serif", category: "Sans-serif" },
  { name: "Space Grotesk", value: "Space Grotesk, sans-serif", category: "Sans-serif" },
  { name: "Figtree", value: "Figtree, sans-serif", category: "Sans-serif" },
  
  // === SERIF FONTS ===
  { name: "Merriweather", value: "Merriweather, serif", category: "Serif" },
  { name: "Playfair Display", value: "Playfair Display, serif", category: "Serif" },
  { name: "Roboto Slab", value: "Roboto Slab, serif", category: "Serif" },
  { name: "PT Serif", value: "PT Serif, serif", category: "Serif" },
  { name: "Vollkorn", value: "Vollkorn, serif", category: "Serif" },
  { name: "Cormorant Garamond", value: "Cormorant Garamond, serif", category: "Serif" },
  { name: "Slabo 27px", value: "Slabo 27px, serif", category: "Serif" },
  { name: "Crimson Text", value: "Crimson Text, serif", category: "Serif" },
  { name: "Libre Baskerville", value: "Libre Baskerville, serif", category: "Serif" },
  { name: "Tinos", value: "Tinos, serif", category: "Serif" },
  { name: "Source Serif Pro", value: "Source Serif Pro, serif", category: "Serif" },
  { name: "IBM Plex Serif", value: "IBM Plex Serif, serif", category: "Serif" },
  { name: "Lora", value: "Lora, serif", category: "Serif" },
  { name: "Bitter", value: "Bitter, serif", category: "Serif" },
  { name: "Alegreya", value: "Alegreya, serif", category: "Serif" },
  { name: "Crimson Pro", value: "Crimson Pro, serif", category: "Serif" },
  { name: "EB Garamond", value: "EB Garamond, serif", category: "Serif" },
  { name: "Spectral", value: "Spectral, serif", category: "Serif" },
  { name: "Zilla Slab", value: "Zilla Slab, serif", category: "Serif" },
  { name: "Arvo", value: "Arvo, serif", category: "Serif" },
  { name: "Old Standard TT", value: "Old Standard TT, serif", category: "Serif" },
  { name: "Cardo", value: "Cardo, serif", category: "Serif" },
  
  // === DISPLAY FONTS ===
  { name: "Oswald", value: "Oswald, sans-serif", category: "Display" },
  { name: "Abril Fatface", value: "Abril Fatface, serif", category: "Display" },
  { name: "Bebas Neue", value: "Bebas Neue, sans-serif", category: "Display" },
  { name: "Righteous", value: "Righteous, sans-serif", category: "Display" },
  { name: "Bangers", value: "Bangers, sans-serif", category: "Display" },
  { name: "Fredoka One", value: "Fredoka One, sans-serif", category: "Display" },
  { name: "Orbitron", value: "Orbitron, sans-serif", category: "Display" },
  { name: "Anton", value: "Anton, sans-serif", category: "Display" },
  { name: "Archivo Black", value: "Archivo Black, sans-serif", category: "Display" },
  { name: "Alfa Slab One", value: "Alfa Slab One, serif", category: "Display" },
  { name: "Bungee", value: "Bungee, cursive", category: "Display" },
  { name: "Russo One", value: "Russo One, sans-serif", category: "Display" },
  { name: "Passion One", value: "Passion One, cursive", category: "Display" },
  { name: "Fjalla One", value: "Fjalla One, sans-serif", category: "Display" },
  { name: "Squada One", value: "Squada One, cursive", category: "Display" },
  { name: "Racing Sans One", value: "Racing Sans One, cursive", category: "Display" },
  { name: "Black Ops One", value: "Black Ops One, cursive", category: "Display" },
  { name: "Creepster", value: "Creepster, cursive", category: "Display" },
  
  // === HANDWRITING & SCRIPT ===
  { name: "Dancing Script", value: "Dancing Script, cursive", category: "Handwriting" },
  { name: "Pacifico", value: "Pacifico, cursive", category: "Handwriting" },
  { name: "Lobster", value: "Lobster, cursive", category: "Handwriting" },
  { name: "Delius Unicase", value: "Delius Unicase, cursive", category: "Handwriting" },
  { name: "Great Vibes", value: "Great Vibes, cursive", category: "Handwriting" },
  { name: "Satisfy", value: "Satisfy, cursive", category: "Handwriting" },
  { name: "Kaushan Script", value: "Kaushan Script, cursive", category: "Handwriting" },
  { name: "Shadows Into Light", value: "Shadows Into Light, cursive", category: "Handwriting" },
  { name: "Amatic SC", value: "Amatic SC, cursive", category: "Handwriting" },
  { name: "Indie Flower", value: "Indie Flower, cursive", category: "Handwriting" },
  { name: "Cookie", value: "Cookie, cursive", category: "Handwriting" },
  { name: "Caveat", value: "Caveat, cursive", category: "Handwriting" },
  { name: "Permanent Marker", value: "Permanent Marker, cursive", category: "Handwriting" },
  
  // === MONOSPACE ===
  { name: "Roboto Mono", value: "Roboto Mono, monospace", category: "Monospace" },
  { name: "Source Code Pro", value: "Source Code Pro, monospace", category: "Monospace" },
  { name: "Fira Code", value: "Fira Code, monospace", category: "Monospace" },
  { name: "JetBrains Mono", value: "JetBrains Mono, monospace", category: "Monospace" },
  { name: "IBM Plex Mono", value: "IBM Plex Mono, monospace", category: "Monospace" },
  { name: "Ubuntu Mono", value: "Ubuntu Mono, monospace", category: "Monospace" },
  { name: "Inconsolata", value: "Inconsolata, monospace", category: "Monospace" },
  { name: "Space Mono", value: "Space Mono, monospace", category: "Monospace" },
  { name: "Courier Prime", value: "Courier Prime, monospace", category: "Monospace" }
];

// --- Default Palette (e‑ink friendly)
export type Palette = {
  paper: string;
  ink: string;
  deEmphasis: string;
  rule: string;
  categories: {
    work: string;      // blue
    personal: string;  // purple
    health: string;    // green
    social: string;    // orange
    family: string;    // red (keeping for compatibility)
    school: string;    // teal (keeping for compatibility)
    sports: string;    // cyan (keeping for compatibility)
    reminder: string;  // amber (keeping for compatibility)
  };
};

const DEFAULT_PALETTE: Palette = {
  paper: "#000000",  // Pure black background
  ink: "#ffffff",    // White text
  deEmphasis: "#888888", // Gray for less important text  
  rule: "#444444",   // Dark gray for borders
  categories: {
    work: "#1A73E8",      // Gmail blue
    personal: "#9334E4",  // Purple
    health: "#137333",    // Gmail green
    social: "#EA4335",    // Gmail red
    family: "#FF6D01",    // Orange
    school: "#1A73E8",    // Gmail blue
    sports: "#0D652D",    // Dark green
    reminder: "#F9AB00",  // Gmail yellow
  },
};

// Mock events (empty - CalDAV is the primary data source)

// Format time for e‑ink readability
function fmtTime(d?: Date) {
  if (!d) return "";
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? "p" : "a";
  const hr = ((h + 11) % 12) + 1;
  return `${hr}:${m.toString().padStart(2, "0")}${ampm}`;
}

// Calculate optimal font size to fit text in single line
function getOptimalFontSize(text: string, maxWidth: number, baseFontSize: number, minFontSize = 8): number {
  // Rough estimate: 1 character ≈ 0.6 * fontSize in pixels
  const estimatedWidth = text.length * 0.6 * baseFontSize;
  
  if (estimatedWidth <= maxWidth) {
    return baseFontSize; // Text fits at base size
  }
  
  // Calculate what font size would fit
  const calculatedFontSize = (maxWidth / text.length) / 0.6;
  
  // Don't shrink beyond what would fit 24 characters
  const minSizeFor24Chars = (maxWidth / 24) / 0.6;
  const effectiveMinSize = Math.max(minFontSize, minSizeFor24Chars);
  
  // Return the larger of calculated size or effective minimum size
  return Math.max(effectiveMinSize, Math.min(baseFontSize, calculatedFontSize));
}

// Function to calculate font size with shrinking before wrapping
function calculateFontSizeWithShrinking(text: string, baseSize: number, containerWidth: number, minShrinkage: number = 0.5) {
  // More conservative character width estimation (accounts for bold text and wider fonts)
  const charWidthRatio = 0.8; // Increased from 0.6 to be more conservative
  const estimatedTextWidth = text.length * (baseSize * charWidthRatio);
  
  if (estimatedTextWidth <= containerWidth) {
    return baseSize; // Text fits at full size
  }
  
  // Calculate the minimum font size (50% of original = 50% shrink)
  const minSize = baseSize * minShrinkage;
  
  // Calculate what font size would fit the text in one line (more conservative)
  const fittingSize = (containerWidth * 0.9) / (text.length * charWidthRatio); // Use 90% of container for safety
  
  // Return the larger of fitting size or minimum allowed size
  const finalSize = Math.max(minSize, Math.min(fittingSize, baseSize));
  
  // ...existing code...
  
  return finalSize;
}

// --- Main App
export default function CalendarCustomizerApp() {
  const [today] = useState(new Date()); // Use actual current date
  const [safeMargin, setSafeMargin] = useState(16);
  const [monthFontSize, setMonthFontSize] = useState(70);
  const [weekdayFontSize, setWeekdayFontSize] = useState(30);
  const [eventFontSize, setEventFontSize] = useState(48);
  const [backgroundColor, setBackgroundColor] = useState("#fd8e44");
  const [monthFontFamily, setMonthFontFamily] = useState("Delius Unicase, cursive");
  const [eventFontFamily, setEventFontFamily] = useState("Delius Unicase, cursive");
  const [monthBold, setMonthBold] = useState(true);
  const [eventBold, setEventBold] = useState(true);
  const [palette] = useState<Palette>(DEFAULT_PALETTE);
  
  // Font management states
  const [customFonts, setCustomFonts] = useState<Array<{name: string, value: string, category: string}>>([]);
  const [fontSearchTerm, setFontSearchTerm] = useState("");
  const [selectedFontCategory, setSelectedFontCategory] = useState("All");
  const [customFontInput, setCustomFontInput] = useState("");
  const [showAddFontForm, setShowAddFontForm] = useState(false);
  
  // CalDAV integration
  const [useCalDAV, setUseCalDAV] = useState(true);
  const [calDAVEvents, setCalDAVEvents] = useState<CalendarEvent[]>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [calDAVError, setCalDAVError] = useState<string | null>(null);

  // Combine built-in and custom fonts
  const allFonts = useMemo(() => {
    return [...GOOGLE_FONTS, ...customFonts];
  }, [customFonts]);

  // Filter fonts based on search term and category
  const filteredFonts = useMemo(() => {
    return allFonts.filter(font => {
      const matchesSearch = font.name.toLowerCase().includes(fontSearchTerm.toLowerCase());
      const matchesCategory = selectedFontCategory === "All" || font.category === selectedFontCategory;
      return matchesSearch && matchesCategory;
    });
  }, [allFonts, fontSearchTerm, selectedFontCategory]);

  // Get unique categories for filter dropdown
  const fontCategories = useMemo(() => {
    const categories = Array.from(new Set(allFonts.map(font => font.category)));
    return ["All", ...categories.sort()];
  }, [allFonts]);

  // Function to parse Google Fonts URL and extract font information
  const parseGoogleFontsUrl = (url: string) => {
    try {
      const urlObj = new URL(url);
      if (!urlObj.hostname.includes('fonts.googleapis.com')) {
        throw new Error('Not a valid Google Fonts URL');
      }
      
      const familyParam = urlObj.searchParams.get('family');
      if (!familyParam) {
        throw new Error('No family parameter found in URL');
      }

      // Parse font families from the family parameter
      const fonts: Array<{name: string, value: string, category: string}> = [];
      const families = familyParam.split('|');

      families.forEach(family => {
        // Remove weights and styles (everything after ':')
        const fontName = family.split(':')[0].replace(/\+/g, ' ');
        
        // Determine category based on font name (basic heuristic)
        let category = "Sans-serif"; // default
        const nameUpper = fontName.toUpperCase();
        
        if (nameUpper.includes('MONO') || nameUpper.includes('CODE')) {
          category = "Monospace";
        } else if (nameUpper.includes('SERIF') || 
                   ['MERRIWEATHER', 'PLAYFAIR', 'LORA', 'CRIMSON', 'BASKERVILLE'].some(serif => nameUpper.includes(serif))) {
          category = "Serif";
        } else if (['SCRIPT', 'DANCING', 'PACIFICO', 'LOBSTER', 'CAVEAT', 'SATISFY'].some(script => nameUpper.includes(script))) {
          category = "Handwriting";
        } else if (['OSWALD', 'BEBAS', 'ANTON', 'ABRIL', 'RIGHTEOUS', 'BANGERS'].some(display => nameUpper.includes(display))) {
          category = "Display";
        }

        fonts.push({
          name: fontName,
          value: `${fontName}, ${category === "Serif" ? "serif" : category === "Monospace" ? "monospace" : category === "Handwriting" ? "cursive" : "sans-serif"}`,
          category: category
        });
      });

      return fonts;
    } catch (error) {
      throw new Error(`Failed to parse Google Fonts URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Function to dynamically load Google Font
  const loadGoogleFont = (fontName: string) => {
    const linkId = `google-font-${fontName.replace(/\s+/g, '-').toLowerCase()}`;
    
    // Check if font is already loaded
    if (document.getElementById(linkId)) {
      return;
    }

    // Create link element for Google Font
    const link = document.createElement('link');
    link.id = linkId;
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontName)}:wght@400;500;600;700&display=swap`;
    
    document.head.appendChild(link);
  };

  // Handle adding custom fonts from URL
  const handleAddCustomFont = () => {
    if (!customFontInput.trim()) return;

    try {
      let fontsToAdd: Array<{name: string, value: string, category: string}> = [];

      if (customFontInput.startsWith('http')) {
        // Parse Google Fonts URL
        fontsToAdd = parseGoogleFontsUrl(customFontInput);
        
        // Load the fonts
        fontsToAdd.forEach(font => {
          loadGoogleFont(font.name);
        });
      } else {
        // Treat as individual font name
        const fontName = customFontInput.trim();
        fontsToAdd = [{
          name: fontName,
          value: `${fontName}, sans-serif`,
          category: "Custom"
        }];
        
        // Load the font
        loadGoogleFont(fontName);
      }

      // Filter out fonts that already exist
      const existingFontNames = allFonts.map(f => f.name.toLowerCase());
      const newFonts = fontsToAdd.filter(font => 
        !existingFontNames.includes(font.name.toLowerCase())
      );

      if (newFonts.length > 0) {
        setCustomFonts(prev => [...prev, ...newFonts]);
        setCustomFontInput("");
        setShowAddFontForm(false);
        
        // Show success message (you can replace this with a toast)
        alert(`Successfully added ${newFonts.length} font(s): ${newFonts.map(f => f.name).join(', ')}`);
      } else {
        alert("No new fonts found or all fonts already exist");
      }
    } catch (error) {
      alert(`Error adding font: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Function to fetch CalDAV events
  const fetchCalDAVEvents = async () => {
    setIsLoadingEvents(true);
    setCalDAVError(null);
    
    try {
      // Get the full date range shown on the calendar (including prev/next month dates)
      const firstVisibleDate = monthCells[0].date;
      const lastVisibleDate = monthCells[monthCells.length - 1].date;
      
      const events = await calDAVService.fetchEvents(firstVisibleDate, lastVisibleDate);
      setCalDAVEvents(events);
      console.log(`Loaded ${events.length} events from CalDAV`);
    } catch (error) {
      console.error('Failed to fetch CalDAV events:', error);
      setCalDAVError(error instanceof Error ? error.message : 'Failed to fetch calendar events');
    } finally {
      setIsLoadingEvents(false);
    }
  };

  // Load CalDAV events when enabled
  useEffect(() => {
    if (useCalDAV && calDAVService.isConfigured()) {
      fetchCalDAVEvents();
    }
  }, [useCalDAV]);

  // Convert CalDAV events to the format expected by the calendar
  // Allowed categories for EventItem
  const allowedCategories: (keyof Palette["categories"])[] = [
    "work", "personal", "health", "social", "family", "school", "sports", "reminder"
  ];

  // Convert CalDAV events to the format expected by the calendar
  const convertCalDAVEvents = (events: CalendarEvent[]) => {
    return events.map(event => {
      // Validate and map category
      let category: keyof Palette["categories"] = "work";
      if (typeof event.category === "string" && allowedCategories.includes(event.category as keyof Palette["categories"])) {
        category = event.category as keyof Palette["categories"];
      }
      return {
        id: event.id,
        title: event.title,
        start: event.start,
        end: event.end,
        category,
        allDay: event.allDay || false,
      };
    });
  };

  // Use CalDAV events if enabled, otherwise use sample events
  // Use CalDAV events if enabled, otherwise use sample events
  const events = convertCalDAVEvents(calDAVEvents);
  // ...existing code...

  const renderRef = useRef<HTMLDivElement>(null);

  const monthCells = useMemo(() => getMonthMatrix(today.getFullYear(), today.getMonth()), [today]);
  const eventsByDay = useMemo(() => {
    const map: { [key: string]: EventItem[] } = {};
    events.forEach(e => {
      if (e.allDay && e.start && e.end && e.end > e.start) {
        // Multi-day all-day event: add to every day in [start, end)
        let d = new Date(e.start);
        while (d < e.end) {
          const key = ymd(d);
          if (!map[key]) map[key] = [];
          map[key].push(e);
          d.setDate(d.getDate() + 1);
        }
      } else {
        // Single-day or timed event
        const key = ymd(e.start);
        if (!map[key]) map[key] = [];
        map[key].push(e);
      }
    });
    
    // Sort events within each day: ALL events first, then AM, then PM
    Object.keys(map).forEach(key => {
      map[key].sort((a, b) => {
        // All-day events first
        if (a.allDay && !b.allDay) return -1;
        if (!a.allDay && b.allDay) return 1;
        if (a.allDay && b.allDay) return 0; // Both all-day, keep original order
        
        // For timed events, sort by time
        return a.start.getTime() - b.start.getTime();
      });
    });
    
    return map;
  }, [events]);

  const handleDownload = async () => {
    const node = renderRef.current;
    if (!node) return;
    // Use pixelRatio=1 to align with 1:1 e‑ink rendering
    const dataUrl = await htmlToImage.toPng(node, { pixelRatio: 1, cacheBust: true });
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `calendar_${new Date().toISOString().slice(0, 10)}.png`;
    a.click();
  };

  // Layout constants for 2560x1440 display
  const CANVAS_W = 2560;
  const CANVAS_H = 1440;
  
  // Calculate cell dimensions for 5x7 grid
  const availableW = CANVAS_W - (safeMargin * 2);
  const availableH = CANVAS_H - (safeMargin * 2);
  const headerH = 120; // Space for month title and weekday headers
  const gridH = availableH - headerH;
  const cellW = Math.floor(availableW / 7);
  const cellH = Math.floor(gridH / 5);

  // Function to calculate dynamic event height
  const calculateEventHeight = (totalEvents: number, isAllDay: boolean = false) => {
    const cellPadding = 16; // 8px top + 8px bottom
    const dayNumberSpace = 30; // Reduced space reserved for day number area
    const availableSpace = cellH - cellPadding - dayNumberSpace;
    
    if (totalEvents === 0) return isAllDay ? 70 : 55; // Increased default height
    
    // Calculate height per event, with min/max constraints
    const calculatedHeight = Math.floor(availableSpace / totalEvents);
    const minHeight = isAllDay ? 40 : 35; // Increased minimum readable height
    const maxHeight = isAllDay ? 120 : 100;  // Increased maximum height for fewer events
    
    const finalHeight = Math.max(minHeight, Math.min(maxHeight, calculatedHeight));
    console.log(`Events: ${totalEvents}, Available: ${availableSpace}, Calculated: ${calculatedHeight}, Final: ${finalHeight}, IsAllDay: ${isAllDay}`);
    return finalHeight;
  };

  // Weekday labels
  const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return (
    <>
      <style>
        {`
          .gmail-theme .month-title,
          .gmail-theme .weekday-header {
            color: ${palette.ink} !important;
          }
          .gmail-theme .day-cell * {
            color: #000000 !important;
          }
          .gmail-theme .day-cell .today-date {
            color: #FFFFFF !important;
          }
        `}
      </style>
      <div className="w-full h-full flex gap-4 p-4 bg-neutral-50">
      {/* Controls */}
      <div className="w-[380px] shrink-0 space-y-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2"><Settings2 className="w-5 h-5"/>Calendar Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-2 gap-3 items-center">
              <Label className="col-span-1">Safe margin</Label>
              <div className="px-2 flex items-center gap-2">
                <Slider min={16} max={80} step={8} value={[safeMargin]} onValueChange={(v)=>setSafeMargin(v[0])} className="flex-1"/>
                <span className="text-sm font-mono w-8 text-right">{safeMargin}</span>
              </div>

              <Label>Month title size</Label>
              <div className="px-2 flex items-center gap-2">
                <Slider min={40} max={120} step={5} value={[monthFontSize]} onValueChange={(v)=>setMonthFontSize(v[0])} className="flex-1"/>
                <span className="text-sm font-mono w-8 text-right">{monthFontSize}</span>
              </div>

              <Label>Weekday size</Label>
              <div className="px-2 flex items-center gap-2">
                <Slider min={20} max={60} step={2} value={[weekdayFontSize]} onValueChange={(v)=>setWeekdayFontSize(v[0])} className="flex-1"/>
                <span className="text-sm font-mono w-8 text-right">{weekdayFontSize}</span>
              </div>

              <Label>Event text size</Label>
              <div className="px-2 flex items-center gap-2">
                <Slider min={12} max={80} step={2} value={[eventFontSize]} onValueChange={(v)=>setEventFontSize(v[0])} className="flex-1"/>
                <span className="text-sm font-mono w-8 text-right">{eventFontSize}</span>
              </div>

              <Label>Background color</Label>
              <div className="px-2 flex items-center gap-2">
                <input 
                  type="color" 
                  value={backgroundColor} 
                  onChange={(e) => setBackgroundColor(e.target.value)}
                  className="w-12 h-8 rounded border cursor-pointer"
                  title="Choose background color"
                />
                <span className="text-sm font-mono flex-1">{backgroundColor}</span>
              </div>

              <Label>Month title font</Label>
              <div className="px-2 space-y-2">
                {/* Font search and filter */}
                <div className="flex gap-2">
                  <Input 
                    placeholder="Search fonts..." 
                    value={fontSearchTerm}
                    onChange={(e) => setFontSearchTerm(e.target.value)}
                    className="flex-1 text-xs"
                  />
                  <select 
                    value={selectedFontCategory} 
                    onChange={(e) => setSelectedFontCategory(e.target.value)}
                    className="px-2 py-1 text-xs border rounded"
                  >
                    {fontCategories.map(category => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </div>
                
                {/* Font selector */}
                <select 
                  value={monthFontFamily} 
                  onChange={(e) => {
                    setMonthFontFamily(e.target.value);
                    // Extract font name and load it dynamically
                    const fontName = e.target.value.split(',')[0];
                    loadGoogleFont(fontName);
                  }}
                  className="w-full p-2 text-sm border rounded max-h-32 overflow-y-auto"
                  style={{ fontFamily: monthFontFamily }}
                  size={Math.min(filteredFonts.length, 6)}
                >
                  {filteredFonts.map(font => (
                    <option key={font.value} value={font.value} style={{ fontFamily: font.value }}>
                      {font.name} ({font.category})
                    </option>
                  ))}
                </select>
                
                {/* Add custom font button */}
                <button 
                  onClick={() => setShowAddFontForm(!showAddFontForm)}
                  className="w-full py-1 text-xs text-blue-600 border border-blue-300 rounded hover:bg-blue-50"
                >
                  {showAddFontForm ? '× Cancel' : '+ Add Custom Font'}
                </button>
                
                {/* Custom font form */}
                {showAddFontForm && (
                  <div className="p-2 bg-gray-50 rounded space-y-2">
                    <Input 
                      placeholder="Paste Google Fonts URL or font name..."
                      value={customFontInput}
                      onChange={(e) => setCustomFontInput(e.target.value)}
                      className="text-xs"
                    />
                    <div className="text-xs text-gray-600">
                      Examples:
                      <br />• https://fonts.googleapis.com/css2?family=Roboto
                      <br />• Roboto
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={handleAddCustomFont}
                        className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                        disabled={!customFontInput.trim()}
                      >
                        Add Font
                      </button>
                      <button 
                        onClick={() => {
                          setShowAddFontForm(false);
                          setCustomFontInput("");
                        }}
                        className="px-3 py-1 text-xs bg-gray-300 rounded hover:bg-gray-400"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <Label>Event text font</Label>
              <div className="px-2">
                <select 
                  value={eventFontFamily} 
                  onChange={(e) => {
                    setEventFontFamily(e.target.value);
                    // Extract font name and load it dynamically
                    const fontName = e.target.value.split(',')[0];
                    loadGoogleFont(fontName);
                  }}
                  className="w-full p-2 text-sm border rounded max-h-32 overflow-y-auto"
                  style={{ fontFamily: eventFontFamily }}
                  size={Math.min(filteredFonts.length, 6)}
                >
                  {filteredFonts.map(font => (
                    <option key={font.value} value={font.value} style={{ fontFamily: font.value }}>
                      {font.name} ({font.category})
                    </option>
                  ))}
                </select>
              </div>

              <Label>Month title bold</Label>
              <div className="px-2 flex items-center">
                <input 
                  type="checkbox" 
                  checked={monthBold} 
                  onChange={(e) => setMonthBold(e.target.checked)}
                  className="w-4 h-4 mr-2"
                />
                <span className="ml-2 text-sm">
                  {monthBold ? 'Bold' : 'Normal'}
                </span>
              </div>

              <Label>Event text bold</Label>
              <div className="px-2 flex items-center">
                <input 
                  type="checkbox" 
                  checked={eventBold} 
                  onChange={(e) => setEventBold(e.target.checked)}
                  className="w-4 h-4 mr-2"
                />
                <span className="ml-2 text-sm">
                  {eventBold ? 'Bold' : 'Normal'}
                </span>
              </div>
            </div>

            <Button onClick={handleDownload} className="w-full"><Download className="w-4 h-4 mr-2"/>Download PNG (2560×1440)</Button>
          </CardContent>
        </Card>

        {/* CalDAV Integration */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="w-5 h-5"/>
              Calendar Integration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="use-caldav">Use Google Calendar (CalDAV)</Label>
              {/* Fallback toggle if Switch component doesn't work */}
              <input
                type="checkbox"
                id="use-caldav"
                checked={useCalDAV}
                onChange={(e) => setUseCalDAV(e.target.checked)}
                disabled={!calDAVService.isConfigured()}
                className="w-4 h-4"
              />
            </div>
            
            {!calDAVService.isConfigured() && (
              <div className="text-sm text-amber-600 bg-amber-50 p-2 rounded">
                <strong>Setup required:</strong> Configure CalDAV credentials in .env file
              </div>
            )}
            
            {calDAVService.isConfigured() && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Wifi className="w-4 h-4 text-green-500" />
                  <span className="text-sm text-green-600">CalDAV configured</span>
                </div>
                
                <div className="text-xs text-gray-600">
                  Calendar filter: <strong>{(import.meta as any).env.VITE_CALDAV_CALENDAR_FILTER || 'All calendars'}</strong>
                </div>
                
                {useCalDAV && (
                  <Button 
                    onClick={fetchCalDAVEvents} 
                    disabled={isLoadingEvents}
                    variant="outline"
                    size="sm"
                  >
                    {isLoadingEvents ? 'Loading...' : 'Refresh Events'}
                  </Button>
                )}
                
                {calDAVError && (
                  <div className="text-sm text-red-600 bg-red-50 p-2 rounded">
                    <strong>Error:</strong> {calDAVError}
                    {calDAVError.includes('CORS') && (
                      <div className="mt-2 text-xs">
                        <strong>Solution:</strong> CalDAV requires a backend proxy for browser access. 
                        <br />Alternative: Install a CORS browser extension for development.
                      </div>
                    )}
                  </div>
                )}
                
                {useCalDAV && calDAVEvents.length > 0 && (
                  <div className="text-sm text-blue-600">
                    ✅ Loaded {calDAVEvents.length} events from calendar
                  </div>
                )}
                
                {useCalDAV && calDAVEvents.length === 0 && !isLoadingEvents && !calDAVError && (
                  <div className="text-sm text-yellow-600">
                    ⚠️ No events found in calendar for this month
                  </div>
                )}
                
                {!useCalDAV && (
                  <div className="text-sm text-gray-600">
                    📋 Using sample events (CalDAV disabled)
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Font Features</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>• <strong>{allFonts.length} fonts available</strong> (built-in + custom)</p>
            <p>• Search by name or filter by category</p>
            <p>• Add Google Fonts by URL or name</p>
            <p>• Fonts load dynamically when selected</p>
            {customFonts.length > 0 && (
              <div>
                <p>• <strong>{customFonts.length} custom fonts</strong> added</p>
                <button 
                  onClick={() => setCustomFonts([])}
                  className="mt-2 px-3 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
                >
                  Clear All Custom Fonts
                </button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Notes</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>• 5×7 grid layout optimized for 32" display at 2560×1440</p>
            <p>• Auto-sizing text to fill each day cell efficiently</p>
            <p>• E-ink friendly colors with minimal fills</p>
            <p>• Cell size: {cellW}×{cellH} pixels</p>
          </CardContent>
        </Card>
      </div>

      {/* Preview Panel */}
      <div className="flex-1 overflow-auto">
        <div className="text-sm text-neutral-500 mb-2">
          Live Preview (exact 2560×1440 pixels). Cell size: {cellW}×{cellH}px
        </div>
        <div
          ref={renderRef}
          style={{ 
            width: CANVAS_W, 
            height: CANVAS_H, 
            background: backgroundColor, 
            color: palette.ink + ' !important'
          }}
          className="relative shadow ring-1 ring-neutral-200 mx-auto gmail-theme"
        >
          {/* Content with safe margins */}
          <div style={{ position: "absolute", inset: safeMargin }} className="flex flex-col">
            {/* Month Title */}
            <div 
              className="text-center mb-4 month-title" 
              style={{ 
                fontSize: Math.min(monthFontSize, availableW / 15), 
                fontFamily: monthFontFamily,
                fontWeight: monthBold ? 900 : 400,
                lineHeight: 1,
                height: 60 
              }}
            >
              {today.toLocaleString(undefined, { month: "long", year: "numeric" })}
            </div>

            {/* Weekday Headers */}
            <div 
              className="grid mb-2" 
              style={{ 
                gridTemplateColumns: `repeat(7, ${cellW}px)`, 
                height: 40,
                paddingBottom: 8,
                justifyContent: "center"
              }}
            >
              {WD.map((w) => (
                <div 
                  key={w} 
                  className="text-center font-bold flex items-center justify-center weekday-header" 
                  style={{ 
                    fontSize: Math.min(weekdayFontSize, cellW / 8),
                    color: palette.ink + ' !important',
                    width: `${cellW}px`
                  }}
                >
                  {w}
                </div>
              ))}
            </div>

            {/* 5×7 Calendar Grid */}
            <div 
              className="grid gap-1 flex-1" 
              style={{ 
                gridTemplateColumns: `repeat(7, ${cellW}px)`, 
                gridTemplateRows: `repeat(5, ${cellH}px)`,
                justifyContent: "center"
              }}
            >
              {monthCells.map(({ date, inMonth }, idx) => {
                const key = ymd(date);
                const allEvents = (eventsByDay[key] || []).slice(0, 4); // Max 4 events per cell
                const allDayEvents = allEvents.filter(e => e.allDay);
                const timedEvents = allEvents.filter(e => !e.allDay);
                const isToday = ymd(date) === ymd(today);
                
                // Calculate dynamic heights based on number of events
                const totalEvents = allEvents.length;
                const allDayEventHeight = calculateEventHeight(totalEvents, true);
                const timedEventHeight = calculateEventHeight(totalEvents, false);
                
                return (
                  <div 
                    key={idx} 
                    className="relative flex flex-col overflow-hidden day-cell" 
                    style={{ 
                      width: `${cellW - 0.5}px`,
                      height: `${cellH - 0.5}px`,
                      margin: '0.25px',
                      padding: '8px',
                      opacity: inMonth ? 1 : 0.4,
                      backgroundColor: '#FFFFFF' // White day cells
                    }}
                  >
                    
                    {/* Top row: All-day events and day number */}
                    <div className="flex items-start justify-between mb-2 shrink-0" style={{ minHeight: '40px' }}>
                      {/* All-day events */}
                      <div className="flex-1 mr-2 overflow-hidden space-y-1">
                        {allDayEvents.map((e, eventIdx) => {
                          // Calculate available width for text (container width minus padding and border)
                          const availableWidth = cellW * 0.8; // Use 80% of cell width for more generous space
                          
                          // Debug logging
                          console.log(`All-day event: "${e.title.substring(0, 20)}..." | cellW: ${cellW} | availableWidth: ${availableWidth}`);
                          
                          // Try to shrink font size before wrapping (50% max shrink)
                          const adjustedFontSize = calculateFontSizeWithShrinking(
                            e.title, 
                            eventFontSize, 
                            availableWidth, 
                            0.5 // Allow shrinking to 50% (50% reduction)
                          );
                          
                          // If we had to shrink significantly, allow wrapping; otherwise try to keep single line
                          const shouldWrap = adjustedFontSize < eventFontSize * 0.9;
                          
                          return (
                            <div 
                              key={e.id} 
                              className="px-1 py-1 leading-tight"
                              style={{ 
                                borderBottom: '2px solid #444444', // Just bottom border instead of full box
                                backgroundColor: 'transparent',
                                minHeight: `${allDayEventHeight}px`,
                                maxHeight: `${allDayEventHeight}px`,
                                overflow: 'visible', // Allow content to be visible
                                display: 'flex',
                                alignItems: 'center', // Center vertically
                                justifyContent: 'flex-start', // Left align horizontally
                                lineHeight: 1.2,
                                width: '100%' // Ensure container takes full width
                              }}
                            >
                              <div 
                                className="all-day-event-text"
                                style={{ 
                                color: '#000000', // Dark text for readability on colored backgrounds
                                fontFamily: eventFontFamily,
                                fontWeight: eventBold ? 700 : 400,
                                fontSize: `${adjustedFontSize}px`, // Apply shrunk font size
                                overflow: 'visible', // Allow text to be visible
                                whiteSpace: shouldWrap ? 'normal' : 'nowrap', // Only wrap if font shrinking wasn't enough
                                wordWrap: shouldWrap ? 'break-word' : 'normal', // Force break only if wrapping
                                textAlign: 'left', // Left align text horizontally
                                width: 'max-content', // Let text determine its own width
                                maxWidth: '100%', // But don't exceed container
                                lineHeight: 1.2,
                                marginLeft: '8px' // Add slight left indent
                              }}>
                                {e.title}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      
                      {/* Day number on the right */}
                      <div 
                        className={isToday ? "today-date" : ""}
                        style={{ 
                          fontSize: 30,
                          fontWeight: '900',
                          color: isToday ? '#FFFFFF' : '#000000', // White text for today, black for others
                          lineHeight: 1,
                          width: '40px',
                          height: '40px',
                          borderRadius: '50%',
                          backgroundColor: isToday ? backgroundColor : 'transparent', // Use selected background color for today
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        {date.getDate()}
                      </div>
                    </div>
                    
                    {/* Timed Events - with font shrinking and text wrapping */}
                    <div className="flex-1 space-y-1 overflow-hidden">
                      {timedEvents.map((e, eventIdx) => {
                        // Calculate available width for timed event title
                        const timeWidth = e.allDay ? 0 : 60; // Width reserved for time display
                        const availableWidthTimed = (cellW - 0.5) - 8 - 8 - timeWidth - 8; // cell width - margin - padding - time width - spacing
                        
                        // Try to shrink font size before wrapping (50% max shrink)
                        const adjustedTimedFontSize = calculateFontSizeWithShrinking(
                          e.title, 
                          eventFontSize, 
                          availableWidthTimed, 
                          0.5 // Allow shrinking to 50% (50% reduction)
                        );
                        
                        // If we had to shrink significantly, allow wrapping; otherwise try to keep single line
                        const shouldWrapTimed = adjustedTimedFontSize < eventFontSize * 0.9;
                        
                        return (
                          <div 
                            key={e.id} 
                            className="px-1 py-1 leading-tight"
                            style={{ 
                              fontSize: `${adjustedTimedFontSize}px`,
                              borderBottom: '2px solid #444444', // Just bottom border instead of full box
                              backgroundColor: 'transparent',
                              minHeight: `${timedEventHeight}px`,
                              maxHeight: `${timedEventHeight}px`, // Dynamic height based on event count
                              overflow: 'hidden',
                              display: 'flex',
                              alignItems: 'center', // Center vertically
                              whiteSpace: 'normal', // Allow wrapping
                              lineHeight: 1.2
                            }}
                          >
                            <div style={{ 
                              color: '#000000', // Black text for events on white background
                              overflow: 'hidden',
                              textOverflow: 'clip', // Always clip instead of ellipsis since we handle sizing with font shrinking
                              whiteSpace: shouldWrapTimed ? 'normal' : 'nowrap', // Only wrap if font shrinking wasn't enough
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: e.allDay ? 'center' : 'flex-start'
                            }}>
                              {!e.allDay && (
                                <span className="font-semibold" style={{ fontSize: '18px', flexShrink: 0, width: '56px', textAlign: 'left' }}>
                                  {fmtTime(e.start)}
                                </span>
                              )}
                              <span style={{ 
                                marginLeft: e.allDay ? '0px' : '4px', 
                                fontSize: `${adjustedTimedFontSize}px`, 
                                fontFamily: eventFontFamily,
                                fontWeight: eventBold ? 700 : 400,
                                overflow: 'hidden', 
                                whiteSpace: shouldWrapTimed ? 'normal' : 'nowrap', // Allow text wrapping based on shrinking decision
                                wordWrap: shouldWrapTimed ? 'break-word' : 'normal', // Force break only if wrapping
                                textAlign: e.allDay ? 'center' : 'left',
                                flex: 1,
                                lineHeight: 1.2
                              }}>
                                {e.title}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                      
                      {/* More events indicator */}
                      {(allEvents.length) > 4 && (
                        <div 
                          className="text-center font-medium"
                          style={{ 
                            fontSize: Math.min(eventFontSize - 4, cellW / 16),
                            color: isToday ? '#666666' : palette.deEmphasis 
                          }}
                        >
                          +{allEvents.length - 4}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
