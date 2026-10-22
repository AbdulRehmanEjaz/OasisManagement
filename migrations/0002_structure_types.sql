-- Existing records retain their original data. New facility submissions record
-- the observed structure separately from the facility's purpose/category.
ALTER TABLE reports ADD COLUMN structure_type TEXT CHECK(structure_type IS NULL OR structure_type IN ('Concrete/Blocks Building','Animal Shelters','Metal Structures'));
ALTER TABLE facilities ADD COLUMN structure_type TEXT CHECK(structure_type IS NULL OR structure_type IN ('Concrete/Blocks Building','Animal Shelters','Metal Structures'));
CREATE TRIGGER inspection_structure_required BEFORE INSERT ON reports WHEN NEW.kind='inspection' BEGIN
 SELECT CASE WHEN NEW.structure_type IS NULL OR length(trim(coalesce(NEW.site,'')))=0 THEN RAISE(ABORT,'Choose a structure type and enter a site name.') END;
END;
CREATE TRIGGER facility_structure_required BEFORE INSERT ON facilities BEGIN
 SELECT CASE WHEN NEW.structure_type IS NULL THEN RAISE(ABORT,'Choose a structure type and enter a site name.') END;
END;
