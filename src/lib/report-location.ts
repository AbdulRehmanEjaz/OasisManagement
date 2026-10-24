/** The current map/export location, while original GPS evidence stays in storage. */
export function reportLocation<T extends Record<string,any>>(row:T) {
 return row.location_edited_at ? {...row,latitude:row.admin_latitude,longitude:row.admin_longitude,gps_accuracy_meters:null,location_confirmed:0} : row;
}
