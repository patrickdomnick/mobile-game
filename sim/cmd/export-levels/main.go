package main

import (
	"encoding/json"
	"fmt"
	"math"
	"os"

	"github.com/patrickdomnick/mobile-game/sim"
)

type chapterJSON struct {
	ID        int    `json:"id"`
	Roman     string `json:"roman"`
	Name      string `json:"name"`
	ShortName string `json:"shortName"`
	ThemeID   int    `json:"themeId"`
	Subtitle  string `json:"subtitle"`
}

type levelJSON struct {
	ID          int          `json:"id"`
	Chapter     int          `json:"chapter"`
	Theme       int          `json:"theme"`
	Name        string       `json:"name"`
	Cols        int          `json:"cols"`
	Rows        int          `json:"rows"`
	Difficulty  int          `json:"difficulty"`
	Seed        uint32       `json:"seed"`
	NoBlockers  bool         `json:"noBlockers,omitempty"`
	MaxHearts   int          `json:"maxHearts,omitempty"`
	MaxRainbows int          `json:"maxRainbows,omitempty"`
	MaxHidden   int          `json:"maxHidden,omitempty"`
	MaxLocked   int          `json:"maxLocked,omitempty"`
	BoardShape  uint8        `json:"boardShape,omitempty"`
	Stitches    [][4]float64 `json:"stitches"`
}

type catalogJSON struct {
	Version  int           `json:"version"`
	Chapters []chapterJSON `json:"chapters"`
	Levels   []levelJSON   `json:"levels"`
}

func round3(v float32) float64 {
	return math.Round(float64(v)*1000) / 1000
}

func main() {
	cat := catalogJSON{
		Version: 4,
		Chapters: []chapterJSON{
			{ID: 0, Roman: "I", Name: "Jewel Atelier", ShortName: "Jewel", ThemeID: 0, Subtitle: "Sunlit gemstones & artisan brooches"},
			{ID: 1, Roman: "II", Name: "Cyber Arcade", ShortName: "Neon", ThemeID: 1, Subtitle: "Electric synthwave grids & pulses"},
			{ID: 2, Roman: "III", Name: "Pop Studio", ShortName: "Pop", ThemeID: 2, Subtitle: "Bold Warhol primaries & comic ink"},
			{ID: 3, Roman: "IV", Name: "Cathedral Glass", ShortName: "Prism", ThemeID: 3, Subtitle: "Grand rose windows & glowing glass"},
		},
		Levels: make([]levelJSON, 0, len(sim.CuratedArtworks)),
	}

	for _, art := range sim.CuratedArtworks {
		st := make([][4]float64, len(art.Stitches))
		for i, sp := range art.Stitches {
			st[i] = [4]float64{round3(sp.X), round3(sp.Z), float64(sp.Color), float64(sp.Layer)}
		}
		cat.Levels = append(cat.Levels, levelJSON{
			ID:          art.ID,
			Chapter:     art.Chapter,
			Theme:       art.Theme,
			Name:        art.Name,
			Cols:        art.Cols,
			Rows:        art.Rows,
			Difficulty:  art.Difficulty,
			Seed:        art.Seed,
			NoBlockers:  art.NoBlockers,
			MaxHearts:   art.MaxHearts,
			MaxRainbows: art.MaxRainbows,
			MaxHidden:   art.MaxHidden,
			MaxLocked:   art.MaxLocked,
			BoardShape:  art.BoardShape,
			Stitches:    st,
		})
	}

	data, err := json.Marshal(cat)
	if err != nil {
		fmt.Fprintf(os.Stderr, "marshal failed: %v\n", err)
		os.Exit(1)
	}
	outPath := "../public/levels.json"
	if err := os.WriteFile(outPath, append(data, '\n'), 0644); err != nil {
		fmt.Fprintf(os.Stderr, "write failed: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("Exported %d curated levels across %d chapters to %s (%d bytes)\n", len(cat.Levels), len(cat.Chapters), outPath, len(data))
}
