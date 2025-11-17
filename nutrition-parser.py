#!/usr/bin/env python3
"""
Nutrition Plan PDF Parser
Converte automaticamente PDF del piano alimentare in JSON strutturato
"""

import fitz  # PyMuPDF
import json
import re
from datetime import datetime, timedelta

def extract_quantity_and_unit(text):
    """Estrae quantità e unità da un testo come '150 gr di Yogurt Greco 0%'"""
    # Pattern per catturare numero + unità
    pattern = r'(\d+)\s*(g|gr|grammi|ml|pezzi|fette|formelle|cucchiaini|cucchiai|confezione)?'
    match = re.search(pattern, text, re.IGNORECASE)
    
    if match:
        qty = int(match.group(1))
        unit = match.group(2) or "g"
        
        # Normalizza unità
        unit_map = {
            'gr': 'g',
            'grammi': 'g',
            'ml': 'ml',
            'pezzi': 'pezzi',
            'fette': 'pezzi',
            'formelle': 'pezzi',
            'cucchiaini': 'cucchiaini',
            'cucchiai': 'cucchiai',
            'confezione': 'porzione'
        }
        unit = unit_map.get(unit.lower(), unit) if unit else 'g'
        
        return qty, unit
    
    return None, None

def extract_food_name(text):
    """Estrae il nome del cibo pulito"""
    # Rimuovi il trattino iniziale e quantità
    text = re.sub(r'^-\s*', '', text)
    text = re.sub(r'^\d+\s*(g|gr|grammi|ml|pezzi|fette)?\s+(di\s+)?', '', text, flags=re.IGNORECASE)
    
    # Rimuovi note tra parentesi alla fine
    text = re.sub(r'\([^)]+\)$', '', text)
    
    return text.strip()

def parse_meal_section(section_text, meal_name):
    """Parse una sezione di pasto e restituisce gli slot strutturati"""
    slots = {}
    
    # Pattern per identificare slot (Proteine, Carboidrati, Grassi)
    slot_pattern = r'(Proteine|Carboidrati|Grassi):\s*\(scegline uno\)(.*?)(?=Proteine:|Carboidrati:|Grassi:|$)'
    
    for match in re.finditer(slot_pattern, section_text, re.DOTALL | re.IGNORECASE):
        slot_name = match.group(1).lower()
        slot_content = match.group(2)
        
        # Estrai opzioni (linee che iniziano con -)
        options = []
        for line in slot_content.split('\n'):
            line = line.strip()
            if line.startswith('-'):
                qty, unit = extract_quantity_and_unit(line)
                name = extract_food_name(line)
                
                if name:
                    option = {
                        "id": re.sub(r'[^a-z0-9]', '_', name.lower())[:30],
                        "name": name,
                        "inPlan": True
                    }
                    
                    if qty:
                        option["qty"] = qty
                        option["unit"] = unit
                    else:
                        # Se non troviamo quantità, potrebbe essere una descrizione
                        option["qty"] = 1
                        option["unit"] = "porzione"
                    
                    # Aggiungi note visive se presenti
                    visual_match = re.search(r'\((.*?)\)', line)
                    if visual_match:
                        option["visualHelp"] = visual_match.group(1)
                    
                    options.append(option)
        
        if options:
            slots[slot_name] = {
                "options": options
            }
    
    return slots

def parse_nutrition_pdf(pdf_path, user_email=""):
    """Parse completo del PDF e genera JSON"""
    
    doc = fitz.open(pdf_path)
    full_text = ""
    for page in doc:
        full_text += page.get_text()
    doc.close()
    
    # Estrai note generali
    notes = []
    intro_section = full_text.split("Colazione:")[0]
    
    if "Note" in intro_section:
        notes_section = intro_section.split("Note")[1] if "Note" in intro_section else ""
        for line in notes_section.split('\n'):
            line = line.strip()
            if line and not line.startswith('80%') and len(line) > 10:
                notes.append(line)
    
    # Estrai informazioni sul crudo/cotto
    if "CRUDO" in full_text.upper():
        notes.insert(0, "Tutti i pesi sono da considerarsi a CRUDO tranne che per i legumi (pesati cotti)")
    
    # Parse singole sezioni
    meals = {}
    
    # COLAZIONE
    colazione_match = re.search(r'Colazione:.*?(?=Spuntino|$)', full_text, re.DOTALL | re.IGNORECASE)
    if colazione_match:
        meals["colazione"] = parse_meal_section(colazione_match.group(), "colazione")
    
    # SPUNTINO
    spuntino_match = re.search(r'Spuntino.*?(?=\*Pranzo|\*Cena|IMPORTANTE|$)', full_text, re.DOTALL | re.IGNORECASE)
    if spuntino_match:
        meals["spuntino1"] = parse_meal_section(spuntino_match.group(), "spuntino1")
    
    # PRANZO (usa il pattern più complesso dal tuo PDF)
    pranzo_match = re.search(r'\*Pranzo.*?(?=Grassi:.*?-|$)', full_text, re.DOTALL | re.IGNORECASE)
    if pranzo_match:
        pranzo_section = pranzo_match.group()
        meals["pranzo"] = parse_meal_section(pranzo_section, "pranzo")
        
        # Aggiungi flag per carb cycling se presente
        if "IMPORTANTE" in full_text and "allenamento statico" in full_text.lower():
            if "carboidrati" in meals["pranzo"]:
                meals["pranzo"]["carboidrati"]["carbCycling"] = True
                meals["pranzo"]["carboidrati"]["rules"] = {
                    "description": "Nei giorni di allenamento statico/palestra, 1 pasto = SOLO VERDURE",
                    "staticWorkoutDays": "scarico carbo su 1 pasto",
                    "cardioWorkoutDays": "carboidrati normali"
                }
    
    # CENA (di solito identica al pranzo)
    meals["cena"] = meals.get("pranzo", {})
    
    # Crea struttura finale
    plan = {
        "userEmail": user_email,
        "planName": "Piano Personalizzato",
        "createdDate": datetime.now().isoformat(),
        "meals": meals,
        "notes": notes[:5] if notes else [
            "Bevi almeno 2L di acqua al giorno",
            "2 bicchieri di acqua per ogni pasto"
        ]
    }
    
    return plan

def generate_json_from_pdf(pdf_path, output_path=None, user_email=""):
    """Genera il file JSON dal PDF"""
    
    plan = parse_nutrition_pdf(pdf_path, user_email)
    
    if output_path:
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(plan, f, indent=2, ensure_ascii=False)
        print(f"✅ JSON generato: {output_path}")
    
    return plan

if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 2:
        print("Uso: python3 nutrition-parser.py <pdf_path> [output_json_path] [user_email]")
        sys.exit(1)
    
    pdf_path = sys.argv[1]
    output_path = sys.argv[2] if len(sys.argv) > 2 else None
    user_email = sys.argv[3] if len(sys.argv) > 3 else ""
    
    plan = generate_json_from_pdf(pdf_path, output_path, user_email)
    
    if not output_path:
        # Print to stdout se non specificato output
        print(json.dumps(plan, indent=2, ensure_ascii=False))