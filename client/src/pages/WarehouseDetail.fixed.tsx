{/* Nur den relevanten Teil des Codes, der korrigiert werden soll */}

        <TabsContent value="inventory-count">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <CardTitle>Inventurzählung</CardTitle>
                  <CardDescription>
                    Bestandsaufnahme und Abgleich der Lagerbestände
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <InventoryCountNew 
                warehouseId={Number(id)}
                inventory={inventory}
                onComplete={() => {
                  refetchInventory();
                  toast({
                    title: "Inventur abgeschlossen",
                    description: "Die Inventur wurde erfolgreich abgeschlossen und die Bestände aktualisiert."
                  });
                }}
                onCancel={() => {
                  toast({
                    title: "Inventur abgebrochen",
                    description: "Die Inventur wurde abgebrochen."
                  });
                }}
              />
            </CardContent>
          </Card>
        </TabsContent>