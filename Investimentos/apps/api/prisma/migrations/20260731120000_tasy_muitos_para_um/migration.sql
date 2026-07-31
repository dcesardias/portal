BEGIN TRY

BEGIN TRAN;

-- Remove a regra 1-para-1 do vínculo com material do Tasy: agora vários itens
-- podem apontar para o mesmo material (ex.: vários veículos → 1 material Tasy).
IF EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = 'UX_ItemCatalogo_cdMaterialTasy'
    AND object_id = OBJECT_ID('investimentos.ItemCatalogo')
)
  DROP INDEX [UX_ItemCatalogo_cdMaterialTasy] ON [investimentos].[ItemCatalogo];

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
