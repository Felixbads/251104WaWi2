app.get("/api/product-categories", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT name, description, sort_order, is_active 
      FROM product_categories 
      WHERE is_active = true 
      ORDER BY sort_order ASC, name ASC
    `);
    
    res.json(result.rows.map(row => row.name));
  } catch (error) {
    console.error("Fehler beim Laden der Produktkategorien:", error);
    res.status(500).json({ 
      error: "Fehler beim Laden der Produktkategorien",
      message: error instanceof Error ? error.message : "Unbekannter Fehler"
    });
  }
});
