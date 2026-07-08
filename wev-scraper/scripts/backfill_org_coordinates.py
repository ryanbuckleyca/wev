import sys
import logging
import time

from utils.db import supabase
from utils.location_parser import parse_address_with_geocodio

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(message)s")
logger = logging.getLogger(__name__)

def backfill_org_coordinates():
    logger.info("Fetching organizations with missing location coordinates...")
    response = supabase.table("organizations").select("id, location, municipality, province").execute()
    
    orgs = response.data
    if not orgs:
        logger.info("No organizations found.")
        return
        
    orgs_to_update = [o for o in orgs if o.get("location") and not o.get("municipality") and not o.get("province")]
    
    logger.info(f"Found {len(orgs_to_update)} organizations to geocode.")
    
    updates = 0
    for org in orgs_to_update:
        location_str = org["location"]
        org_id = org["id"]
        
        logger.info(f"Geocoding org_id={org_id}, location='{location_str}'...")
        geo_data = parse_address_with_geocodio(location_str)
        
        if geo_data.get("municipality") or geo_data.get("province"):
            supabase.table("organizations").update({
                "municipality": geo_data.get("municipality"),
                "province": geo_data.get("province"),
                "lat": geo_data.get("lat"),
                "lng": geo_data.get("lng"),
                "geocode_accuracy_type": geo_data.get("geocode_accuracy_type")
            }).eq("id", org_id).execute()
            updates += 1
            logger.info(f"  -> Success: {geo_data.get('municipality')}, {geo_data.get('province')}")
        else:
            logger.info("  -> No structured location found.")
            
        time.sleep(1) # Rate limiting
        
    logger.info(f"Completed! Updated {updates} organizations.")

if __name__ == "__main__":
    backfill_org_coordinates()
