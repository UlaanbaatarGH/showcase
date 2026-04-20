# UI conventions

- **FIX201** UI conventions



- **FIX201.1** Form



- **FIX201.1.1** Text input value: white background, dark grey text colour. No bold. No italic.



- **FIX201.1.1.1** Ghost value in a text input: Italic, dark grey text colour. No bold.



- **FIX201.1.2** Disabled text input value: light grey background, dark grey text colour. No bold. No italic.



- **FIX201.1.3** One line text input must always have the same height.



- **FIX201.1.10** Field label: white. No Bold. No Italic.



- **FIX201.1.11** Section label: white. No Bold. No Italic. Upper case.



- **FIX201.1.20** Table header: White. (popup top banner) blue background. No Bold. No Italic.



# Access Rights

- **FIX300** Access Rights



- **FIX300.1** Four rights: The common CRUD listed below with increasing impact:



- **FIX300.1.1** R: Read



- **FIX300.1.2** U: Update



- **FIX300.1.3** C: Create



- **FIX300.1.4** D: Delete



# User

- **FIX310** User



- **FIX310.1** A User is defined by



- **FIX310.1.1** A login name



- **FIX310.1.2** A login password



- **FIX310.1.3** A general profile: admin/common



- **FIX310.1.4** For a user profile, a list of projects with access rights



# Project

- **FIX350** Project



- **FIX350.1** A project is defined by



- **FIX350.1.1** A name



- **FIX350.1.2** An image that represents the project



- **FIX350.1.3** A root directory for the backend app



- **FIX350.1.4** A public/private state



- **FIX350.1.5** An owner : The user who created the project



- **FIX350.2** Project structure



- **FIX350.2.1** Folder tree structure with a single root folder and no depth limit



- **FIX350.2.2** Each folder may contain 2 types of data:



- **FIX350.2.2.1** A list of image files with a defined order



- **FIX350.2.2.2** Each image may optionally have attributes



- **FIX350.2.2.2.1** A caption



- **FIX350.2.2.2.2** A category



- **FIX350.2.2.2** A set of properties (name, value)



- **FIX350.2.3** List of property names



- **FIX350.2.3.1** It is defined by a Master Folder and applies to the master folder and all its subfolders.



- **FIX350.2.3.2** No Master Folder can have another Master Folder in the parent lineage or in any of the subfolders at any depth.



- **FIX350.2.3.3** A project may have several Master Folders.



- **FIX350.2.3.4** Changing the list of properties of a Master Folder automatically applies to all the subfolders.



- **FIX350.10** User access to a project



- **FIX350.10.1** Three groups of actions



- **FIX350.10.1.1** Group 1: Admin profile only



- **FIX350.10.1.1.1** Project creation



- **FIX350.10.1.1.2** Folder creation/reorder/deletion which has no Master Folder above. As such it includes Master Folders.



- **FIX350.10.1.2** Group 2: All profiles .The access rights are globally given for all these actions:



- **FIX350.10.1.2.1** Property creation/deletion



- **FIX350.10.1.3** Group 3: All profiles. The access rights are globally given for all these actions:



- **FIX350.10.1.3.1** Folder creation (under a Master Folder)



- **FIX350.10.1.3.2** Folder name (under a Master Folder)



- **FIX350.10.1.3.3** Folder order (under a Master Folder)



- **FIX350.10.1.3.4** Property creation (at Master Folder level)



- **FIX350.10.1.3.5** Property name (at Master Folder level)



- **FIX350.10.1.3.4** Property value



- **FIX350.10.1.3.5** Image creation



- **FIX350.10.1.3.6** Image order



- **FIX350.10.1.3.7** Image capture attribute



- **FIX350.10.1.3.8** Image category attribute



- **FIX350.10.2** A common user is given 2 sets of access rights: For Group 2 and Group 3.\
  For instance: Group 2: \'-\' and Group 3: \'CRU\'



# Import

## Properties import from Google Sheet

- **FIX370** Google Sheet (gsheet) import



- **FIX370.1** gsheet structure:



- **FIX370.1.1** Mandatory sheet with a name different from 'setup'



- **FIX370.1.1.1** Row 0 as a header with a different property name for each column



- **FIX370.1.1.2** Row 1..N are the values



- **FIX370.1.2** Optional sheet with name 'setup'



- **FIX370.1.2.1(old)** List of (property-name, property-id) on 2 columns.



- **FIX370.1.2.1** List of (property-name, property-id, main) on 3 columns.



- **FIX370.1.2.2** Useful for renaming an existing property.



- **FIX370.1.2.3** New properties are listed with no id.



- **FIX370.1.2.4** 3rd parameter main is just meant to point to the field value to use when giving a recap before the effective import. Any non-blank value suits to says it is the main.



- **FIX370.2** Import consistency checks



- **FIX370.2.0** Id \<gsheet-consistency-checks\>



- **FIX370.2.1** On main sheet



- **FIX370.2.1.1** A '#' column is mandatory. It stands the field 'folder name'.



- **FIX370.2.1.2** Two column headers cannot have the same property name



- **FIX370.2.1.3** The \# value cannot be blank



- **FIX370.2.1.4** Two rows cannot have the \# value



- **FIX370.2.1.5** Fully blank rows are acceptable and ignored



- **FIX370.2.1.6** When no setup sheet is defined



- **FIX370.2.1.6.1** All property names must exist



- **FIX370.2.2** On setup sheet, when defined



- **FIX370.2.2.1** All properties of the main sheet must be listed once



- **FIX370.2.2.2** All property id must exist



- **FIX370.2.2.3** A Property name with no Id cannot already exist.



- **FIX370.2.2.4** A Property name with an Id cannot already exist with another id.



- **FIX370.3** Import command



- **FIX370.3.1** An 'Import' menu is displayed on the app top bar



- **FIX370.3.1.1** Visible only for logged in users



- **FIX370.3.1.2(old)** Menu option 'Properties (Google sheet)'.



- **FIX370.3.1.2** Menu option 'Image Properties'.



- **FIX370.3.2** Import action



- **FIX370.3.2.1** Opens a popup to enter the gsheet url



- **FIX370.3.2.1.1** The last gsheet is stored in the navigator's Local Storage



- **FIX370.3.2.2** On user confirmation,



- **FIX370.3.2.2.1** The gsheet is read and the import consistency checks run \<gsheet-consistency-checks\>. List all the errors in an error popup. Import process is denied.



- **FIX370.3.2.2.2** Show an import recap for user validation with:



- **FIX370.3.2.2.2.1** List of new properties



- **FIX370.3.2.2.2.2** List of renamed properties



- **FIX370.3.2.2.2.3(old)** List of new folders: \# and Main property (if defined in setup)



- **FIX370.3.2.2.2.3** List of new folders: \# and Main property (if defined in setup)



- **FIX370.3.2.2.2.4(old)** List of updated folders: \# and Main property (if defined in setup)



- **FIX370.3.2.2.2.4** List of updated folders: \# and Main property (if defined in setup)



- **FIX370.3.2.2.2.5** Cancel and Import buttons



- **FIX370.3.2.2.3** Effective import



- **FIX370.3.2.2.3.1** Add the new properties



- **FIX370.3.2.2.3.2** Rename the properties to rename



- **FIX370.3.2.2.3.3** Create the new folders with the Id provided by the \# field of the gsheet.



- **FIX370.3.2.2.3.4** Update all property values.



- **FIX370.3.2.2.3.5** Refresh current view.



- **FIX370.3.2.2.3.10\[ex-370.3.2.2.3.5\]** Import done popup with Ok button.



- **FIX370** Google Sheet (gsheet) import



## Image import from hard disk

- **FIX371** Image file import from hard disk



- **FIX371.1** Hard disk structure:



- **FIX371.1.1** One or several folders



- **FIX371.1.2** Folder name is an item id.



- **FIX371.1.2** Each folder contains



- **FIX371.1.2.1** one or several image files



- **FIX371.1.2.2** A text file defining the display order of the images, by listing the filenames: sort.txt



- **FIX371.2** Import command



- **FIX371.2.1** Menu Import



- **FIX371.2.2(old)** Menu option 'Images (hard disk)'



- **FIX371.2.2** Menu option 'Images



- **FIX371.2.2.1** Put menu option at first place



- **FIX371.3** Opens a popup to select one or several folders (Item Folder)



- **FIX371.5** Before effectively import, show an import recap for user validation with:



- **FIX371.5.1** Select image files of type jpg, jpeg, png, webp.



- **FIX371.5.2** List of items id with the number of new, updated, ignored images.



- **FIX371.5.3** To differentiate new/update, the file timestamp is not considered, but a file name may end up with a version suffix, '\_v{n}', before the extension.\
  For instance: 114-20260304_164506_v2.jpg



- **FIX371.5.3.1** A file with no version is equivalent to a V0.



- **FIX371.5.3.2** A file which base name (name without version) does not exist is a new file.



- **FIX371.5.3.3** A file which base name (name without version) already exists, with same or smaller version is ignored.



- **FIX371.5.3.4** A file which base name (name without version) already exists, with bigger version is an update.



- **FIX371.5.5** Cancel and Import buttons



- **FIX371.6** Effective import



- **FIX371.6.1** Creates new Item, when the id is not known



- **FIX371.6.2** Upload the images



- **FIX371.6.3** Refresh view.



# Items grouping

- **FIX372** Items grouping



- **FIX372.1** Terms: So far the term 'Folder' has been used to identify an element of the Showcase view, but it is wrong. It only reflects the disk structure which requires a folder to hold the images. The generic term 'Item' is to be used.



- **FIX372.2** Principle:



- **FIX372.2.1** Group by value: Instead of listing all the items of the project, it might be interesting to show only a subset of items which share a particular field value.



- **FIX372.2.2** Group by segment of values.



- **FIX372.2.2.1** For integer fields, the range of all values can be split by segments.\
  For instance, with a field Year, segments of 10 years, anchored on year 1900.



- **FIX372.2.2.1** For string fields, the range of all values can be split by segments based on the first letter.\
  For instance, A-D, E-H, ..



- **FIX372.3** Item Group definition



- **FIX372.3.1** An item group is associated with an existing Property, and then optionally enter a segment.



- **FIX372.3.1.1** Integer segment: '{lower-number}-{upper-number}'\
  For instance, '1900-1909'



- **FIX372.3.1.2** Text segment: '{lower-letter}-{upper-letter}'\
  For instance, 'A-D'



- **FIX372.5** UI Creation/maintenance



- **FIX372.5.1** Top menu Grouping



- **FIX372.5.1.1** Opens a layer popup with



- **FIX372.5.1.1.1** A table with the list of existing Properties



- **FIX372.5.1.1.1.1** Column 'Id'



- **FIX372.5.1.1.1.2** Column 'Name'



- **FIX372.5.1.1.1.3** Column 'Group' with a checkbox



- **FIX372.5.1.1.1.4** Column 'Group segment' with an input field, enabled only when the Group is checked.



- **FIX372.5.1.1.1.5** Column 'Default' with a checkbox. It says whether this group is active by default



- **FIX372.5.1.1.1.5.1** Checking one row unchecks the others.



- **FIX510.2.1.5.2** Also add the meta property 'Img' in the list, so items can be grouped by having/no having an image.



- **FIX372.5.1.2** Cancel & Ok button



- **FIX372.6** Display on the Showcase view



- **FIX372.6.1(old)** When at least one Item group is defined, a dropdown list is displayed at the top left of the item table, listing all the existing groups. A group is labelled after the property name it relates to.



- **FIX372.6.1** When at least one Item group is defined, a dropdown list is displayed, listing all the existing groups. A group is labelled after the property name it relates to.



- **FIX372.6.1.1** No Group is selected by default unless a Group has the field 'Default' checked.



- **FIX372.6.1.2** The user can always clear the value, refusing to display items by group.



- **FIX372.6.2** When a Group is selected, either by default or by a user action, a side panel is opened on the left the Item table.



- **FIX372.6.2.0** The group dropdown is displayed at the top left of the side panel, otherwise it is displayed at the top left of the item table.



- **FIX372.6.2.1** The list of existing values for the group property, or the list of segments having at least one existing value for the group property.



- **FIX372.6.2.2** Each listed value is postfixed with the number of matching items between ( ).\
  For instance, 1900-1909 (25) when 25 items have a year in the range \[1900..1909\].



- **FIX372.6.2.3** When items have no value for this grouping property, then they are added to a special 'No value ({n-of-items})' group placed at the end of the list of values.



- **FIX372.6.2.10\[ex-372.6.2.2\]** Listed values can be clicked



- **FIX372.6.2.11\[ex-372.6.2.3\]** On click the table of items is refreshed keeping only matching items



# Setup

- **FIX500.2** Photo Setup panel



## Setup: General panel

- **FIX500.2.1** Setup general panel



- **FIX500.2.1.0** Id \<panel-general-setup\>



- **FIX500.2.1.1** Purpose



- **FIX500.2.1.2** UI Layout



- **FIX500.2.1.2.1** Tab 'File Explorer'



- **FIX500.2.1.2.2** Tab 'Showcase'



- **FIX500.2.1.2.3** Panel: View setup: bound to the tab selection:\
  - \<panel-file-explorer-view-setup\>\
  - \<panel-showcase-view-setup\>



- **FIX500.2.1.2.10** Button 'Cancel'



- **FIX500.2.1.2.11** Button 'Save'



- **FIX500.2.1.3** UI Actions



- **FIX500.2.1.3.10** Click 'Save'



- **FIX500.2.1.3.10.1** Saves setup data to a text file.



- **FIX500.2.1.4** UI insertion in the app: layer popup.



## Setup: File Explorer view setup panel

- **FIX500.2.2** File Explorer view setup panel



- **FIX500.2.2.0** Id \<panel-file-explorer-view-setup\>



- **FIX500.2.2.1** Purpose



- **FIX500.2.2.2** UI Layout



- **FIX500.2.2.2.1** Field 'List of properties'



- **FIX500.2.2.2.1.0** Id \<list-photo-properties\>



- **FIX500.2.2.2.1.1** Table of string labels:



- **FIX500.2.2.2.1.1.1** Id: 1-based integer, automatically created with new property creation



- **FIX500.2.2.2.1.1.2** Label: String.



- **FIX500.2.2.2.1.2** Commands to add, insert, remove a property



- **FIX500.2.2.2.2** Field 'Main Image Icon height' (px):



- **FIX500.2.2.2.2.0** Id \<input-main-img-icon-height\>



- **FIX500.2.2.2.2.1** Input field: cannot be empty



- **FIX500.2.2.3** UI User Actions



- **FIX500.2.2.4** UI Insertion in the App: Refer to \<panel-general-setup\>



- **FIX500.2.2.5** Functional rules:



- **FIX500.2.2.5.1** On save: Update all folder property files reflecting the changes: added, relabelled, removed properties.



- **FIX500.2.2.5.2** On save: Update the list of columns in the Showcase view setup: \<list-showcase-columns-setup\>.



## Setup: Showcase view setup panel

- **FIX500.2.3** Showcase view setup panel



- **FIX500.2.3.0** Id \<panel-showcase-view-setup\>



- **FIX500.2.3.1** Purpose



- **FIX500.2.3.2** UI Layout



- **FIX500.2.3.2.1** Section 'Showcase columns'



- **FIX500.2.3.2.1.0** Id \<list-showcase-columns-setup\>



- **FIX500.2.3.2.1.1** Purpose: Define the list of columns to display in the Showcase list \<panel-showcase-list**\>**



- **FIX500.2.3.2.1.2** UI Layout:



- **FIX500.2.3.2.1.2.1** List of items:



- **FIX500.2.3.2.1.2.1.1** For each item, optional field to define the display column width expressed with a free text, which length will be used.



- **FIX500.2.3.2.1.2.1.1.1** If text is just a number n, it should be interpreted as n '0'



- **FIX500.2.3.2.1.2.1.2** For each item, checkbox to indicate whether the text of the field value should wrap.



- **FIX500.2.3.2.1.2.1.3** Default items in the list



- **FIX500.2.3.2.1.2.1.3.1** '#': The Item id (ex-folder name)



- **FIX500.2.3.2.1.2.1.3.2(removed)** 'Img': Boolean value {'x', ' '}. 'x' is set when the item has an uploaded image file.



- **FIX500.2.3.2.1.2.2(old)** Item picker: Aggregates\
  - 'Folder name',\
  - The list of properties: Property labels from \<list-photo-properties\>\
  - 'Main image icon'



- **FIX500.2.3.2.1.2.2** Item picker: Aggregates\
  - 'Folder name',\
  - The list of properties: Property labels from \<list-photo-properties\>\
  - 'Main image icon'\
  - 'With image' (labelled 'Img' once column is added to the Item table).



- **FIX500.2.3.2.1.2.3(old)** Field 'Folder column name'\
  Optional input text field to replace 'Folder name' column name by another text.



- **FIX500.2.3.2.1.2.3** Field '#'\
  Optional input text field to replace '#' column name by another text.



- **FIX500.2.3.2.1.2.4** Field 'Roman year converter'\
  Checkbox that makes a property field 'Year' (case unsensitive) have it values postfix with ' ('yyyy')' when the value is a Roman year (e.g. MDCXIII)



- **FIX500.2.3.2.1.3** UI User Actions



- **FIX500.2.3.2.1.3.1** Add a new item in the list



- **FIX500.2.3.2.1.3.2** Remove an item from the list, but 'Folder name' cannot be removed.



- **FIX500.2.3.2.1.3.3** Move up/down items in the list



- **FIX500.2.3.4** UI Insertion in the App: Refer to \<panel-general-setup\>



# Frontend

## App home page

- **FIX400** Home page



- **FIX400.1** Purpose



- **FIX400.2** UI Layout



- **FIX400.2.1** List of projects with name and associated image



- **FIX400.2.2** Button 'sign in'



- **FIX400.3** UI User Actions



- **FIX400.3.1** Click project name or project photo opens the project



- **FIX400.4** Functional Rules



- **FIX400.4.1** Until the user signs in, only public projects are listed.



- **FIX400.4.2** Once signed in, public and private projects the user has read access are listed.



## Project home page

- **FIX401** Project Home page



- **FIX401.1** It is the Showcase View



# Backend app

- **FIX500** Photo module



## Overview

### UI Overview

- **FIX500.1** UI overview\
  ┌──────────────────────────────────────────┐\
  │ Menu │ Setup │\
  ├──────────────────────────────────────────┤\
  │ Current view details │\
  │ │\
  │ │\
  │ │\
  └──────────────────────────────────────────┘



- **FIX500.1.1** Menu



- **FIX500.1.1.1(old)** View



- **FIX500.1.1.1** Top menu **'**View'



- **FIX500.1.1.1.1** Menu option 'File Explorer': Opens \<view-file-explorer\>



- **FIX500.1.1.1.2** Menu option 'Showcase': \<view-showcase\>



- **FIX500.1.2** Setup



- **FIX500.1.2.1** Button setup



- **FIX500.1.2.1.0** Id \<button-photo-setup\>



- **FIX500.1.2.1.2** Icon: wheel



- **FIX500.1.2.1.3** Action: Opens the Photo Setup panel



### Property file

- **FIX500.20** Property file



- **FIX500.20.1** This text file defines a set of (field-name, field-value) which are properties associated with a folder



- **FIX500.20.2** The list of field names is defined by \<list-photo-properties\> in the Photo module setup.



### Startup

- **FIX501.30** Module startup



- **FIX501.30.1** If no root folder is defined in the navigator's local storage, then prompt the user to select the root folder.



- **FIX501.30.1.1** On validation, save the root folder in the navigator's local storage.



- **FIX501.30.2** By default open the File Explorer View \<view-file-explorer\>



## File Explorer View

- **FIX501** File Explorer View



- **FIX501.0** Id \<view-file-explorer\>



- **FIX501.1**UI page\
  ┌───────────────────────────────────────────┐\
  │ Header panel │\
  ├───────────┬───────────────────────────────┤\
  │ File │ Image Editor panel │\
  │ Explorer │ │\
  │ panel │ │\
  │ │ │\
  └───────────┴───────────────────────────────┘\
  or\
  ┌───────────────────────────────────────────┐\
  │ Header panel │\
  ├───────────┬───────────────────────────────┤\
  │ File │ Folder panel │\
  │ Explorer │ │\
  │ panel │ │\
  │ │ │\
  └───────────┴───────────────────────────────┘



- **FIX501.2** Header panel



- **FIX501.2.1** Display root folder.



### File Explorer panel

- **FIX501.3** File Explorer panel



- **FIX501.3.0** Id \<panel-file-explorer\>



- **FIX501.3.1** Standard tree editor



- **FIX501.3.1.1** Folder icons for folders and page icon for leaf files.



- **FIX501.3.1.2** Folder icons are collapsable by clicking a small arrow icon before the folder icon.



- **FIX501.3.1.3** A vertical scroll bar to navigate through the tree does not include any top panel above the tree.



- **FIX501.3.2** Display the root folder content in the tree



- **FIX501.3.3** By default, expand only level 0 and 1. Keep level 2 collapsed.



- **FIX501.3.4** When an image is set as the Main image, a green tick is displayed after the file name.



- **FIX501.3.3** UI Actions



- **FIX501.3.3.1** Rename folders and file



- **FIX501.3.3.2(old)** Move folders and files



- **FIX501.3.3.2** Move folders and files by drag & drop



- **FIX501.3.3.2.1(old)** Displayed are updated accordingly (added, removed, changed order)



- **FIX501.3.3.2.1** The list and the order of the images displayed in the Folder panel are updated accordingly (added, removed, changed order)



- **FIX501.3.3.2.2** New order of files is saved.



- **FIX501.3.3.2.2** File and folder drag and drop.



- **FIX501.3.3.2.3** Reordering file within a folder, save the sorting list in a hidden text file of the folder.



- **FIX501.3.3.3** Add folder



- **FIX501.3.3.4** Remove folders and files



- **FIX501.3.3.4.1** After removing the selected node, select the node after.



- **FIX501.3.3.5** Node selection



- **FIX501.3.3.5.1** Click a node selects the node



- **FIX501.3.3.5.2** Ctrl-Click a node adds this node to the selection



- **FIX501.3.3.5.3** Shift-Click a node adds this node and all the nodes between this node and the last selected node.



- **FIX501.3.3.5** Right-click opens contextual menu



- **FIX501.3.3.5.1** Menu option 'Move to subfolder\...'



- **FIX501.3.3.5.1.1** Open layer popup with



- **FIX501.3.3.5.1.1.1** Input field Name



- **FIX501.3.3.5.1.1.1.1(old)** Defaulted to a '({number})' name, where {number} is an incremented 2-digit number from 1 within the parent folder



- **FIX501.3.3.5.1.1.1.1** Defaulted to a '{number}' name, where {number} is an incremented 3-digit number from 001 within the parent folder



- **FIX501.3.3.5.1.1.2** Cancel button



- **FIX501.3.3.5.1.1.3** Ok button, enabled WHEN Name is not empty.



- **FIX501.3.3.5.1.2** On OK,



- **FIX501.3.3.5.1.2.1** IF the subfolder does not exist, it is created.



- **FIX501.3.3.5.1.2.2** The selected files are moved to this subfolder.



- **FIX501.3.3.5.1.2.3** The associated meta data files of these files are also moved.



- **FIX501.3.3.5.2** Menu option 'Add properties'



- **FIX501.3.3.5.2.1** Visible only when the selected node is a single folder AND the folder has not already a property file.



- **FIX501.3.3.5.2.2** Create a text file 'properties.txt' in the folder



- **FIX501.3.3.5.2.3** This property file is never listed in the File Explorer panel.



- **FIX501.3.3.5.3** Menu option 'Collapse all' / 'Expand all'



- **FIX501.3.3.5.3.1** IF the node clicked is a file, not visible.



- **FIX501.3.3.5.3.2** IF the node clicked is an expanded folder, 'Collapse all'. Collapses of folder siblings.



- **FIX501.3.3.5.3.3** IF the node clicked is an collapsed folder, 'Expand all'. expanses of folder siblings.



- **FIX501.3.3.5.4** Menu option 'Rename'



- **FIX501.3.3.5.4.1** Visible only when a Folder node is selected



- **FIX501.3.3.5.4.2** Layer popup to rename with Ok or click outside to quit



- **FIX501.3.3.5.5** Menu option 'Add note'



- **FIX501.3.3.5.5.1** Visible only when a Folder node is selected



- **FIX501.3.3.5.5.2** Layer popup to add a 1-line text with Ok or click outside to quit



- **FIX501.3.3.5.5.3** Write the note after the Folder name in the tree



- **FIX501.3.3.5.6** Menu option 'Duplicate'



- **FIX501.3.3.5.6.1** Visible only when a File node is selected



- **FIX501.3.3.5.6.2** Duplicate the file with extension '-{n}', {n} being a 1-based counter incremented only in case the name is already taken



- **FIX501.3.3.6** Ctrl-Space for a unique selected node switches to the Showcase View with the corresponding Folder selected in the Showcase List panel \<panel-showcase-list\>



- **FIX501.3.3.6.1** The Showcase View must scroll to show immediately the selected item.



- **FIX501.3.3.7** Up & Down arrow keys should be used to change the currently selected node to the next one, and not to move the scrollbar.



- **FIX501.3.3.10(old)** Select opens the file in the Image Editor panel if it is an image file.



- **FIX501.3.3.10** Click a node



- **FIX501.3.3.10.1** File node: Opens the file in the Image Editor panel if it is an image file.



- **FIX501.3.3.10.2** Folder node: IF the folder has a property file THEN open the Folder panel instead of the Image Editor panel.



- **FIX501.3.5** Functional rules



- **FIX501.3.5.1** Do not list meta data files associated with the image file.



- **FIX501.3.5.2** Display in italic the name of the files having an associated meta data file.



- **FIX501.3.5.3** Main image:



- **FIX501.3.5.3.1** Only one image of a folder can set as main. The main image is shown with a green tick next to the image file name.



- **FIX501.3.5.3.2** No Main image by default.



### Image Editor panel

- **FIX501.4** Image Editor panel



- **FIX501.4.0** Id \<panel_img_editor\>



- **FIX501.4.1** Purpose: View image and do basic refactoring: cropping and rotation



- **FIX501.4.2** UI Layout



- **FIX501.4.2.1** Toolbox in Editor Header panel



- **FIX501.4.2.1.1** Button Reset



- **FIX501.4.2.1.1.0** Id \<button-reset\>



- **FIX501.4.2.1.2** Button Crop



- **FIX501.4.2.1.2.0** Id \<button-crop\>



- **FIX501.4.2.1.2.1** Type: Push button



- **FIX501.4.2.1.6** Button Adjust Crop



- **FIX501.4.2.1.6.0** Id \<button-adjust-crop\>



- **FIX501.4.2.1.6.1** Type: Toggle button. OFF by default.



- **FIX501.4.2.1.3** Slider Rotate angle



- **FIX501.4.2.1.3.0** Id \<slider-rotate\>



- **FIX501.4.2.1.3.1** Value range : -45 .. +45



- **FIX501.4.2.1.3.2** Enabled only when \<button-crop\> is OFF



- **FIX501.4.2.1.4** Button Rotate -90°.



- **FIX501.4.2.1.4.0** Id \<button-rotate270\>



- **FIX501.4.2.1.4.1** Enabled only when \<button-crop\> is OFF



- **FIX501.4.2.1.5** Button Rotate +90°.



- **FIX501.4.2.1.5.0** Id \<button-rotate90\>



- **FIX501.4.2.1.5.1** Enabled only when \<button-crop\> is OFF



- **FIX501.4.2.2** Button Cancel



- **FIX501.4.2.2.0** Id \<button-cancel\>



- **FIX501.4.2.3** Button Shallow Save



- **FIX501.4.2.3.0** Id \<button-non-destruct-save\>:



- **FIX501.4.2.3** Button Save



- **FIX501.4.2.3.0** Id \<button-destruct-save\>



- **FIX501.4.2.4** Checkbox 'Move to next'



- **FIX501.4.2.4.0** Id \<checkbox move-to-next\>



- **FIX501.4.2.4.1** Location: Place before \<button-cancel\> with checkbox after the text



- **FIX501.4.2.4.2** Unchecked by default, but state is kept when opening another image



- **FIX501.4.2.10** Layout



- **FIX501.4.2.10.1** Left align the toolbox



- **FIX501.4.2.10.2** Right align \<button-cancel\> and \<button-save\>.



- **FIX501.4.3** UI Actions



- **FIX501.4.3.1** Click \<button-crop\>.



- **FIX501.4.3.1.1** Three-step flow



- **FIX501.4.3.1.1.1** Display dotted vertical and horizontal lines starting from the mouse position. This will help the user click at the right place.



- **FIX501.4.3.1.1.2** User clicks the top-left corner to crop



- **FIX501.4.3.1.1.2.1** Show the crop rectangle with bottom-right angle bound to the mouse move.



- **FIX501.4.3.1.1.2.2** When the mouse click is outside of the image, take the last position of the mouse before it quit. It is clearly shown by the dotted lines following the mouse position.



- **FIX501.4.3.1.1.3** User clicks the bottom-right corner to crop



- **FIX501.4.3.1.1.3.1** Hide the crop rectangle



- **FIX501.4.3.1.1.3.2** Execute \<action-img-crop\>.



- **FIX501.4.3.1.1.3.2** When the mouse click is outside of the image, take the last position of the mouse before it quit. It is clearly shown by the dotted lines following the mouse position.



- **FIX501.4.3.2** Grab and move a handle of the crop rectangle



- **FIX501.4.3.9** Click \<button-adjust-crop\>. If new state is



- **FIX501.4.3.9.1** ON: Display the full image with the current crop rectangle over the image.



- **FIX501.4.3.9.2** OFF:



- **FIX501.4.3.9.2.1** IF cropping changed, prompt user to apply or cancel the change.



- **FIX501.4.3.9.2.1.1** IF confirmed, execute \<action-img-crop\>.



- **FIX501.4.3.9.2.2** Hide the crop rectangle



- **FIX501.4.3.5** Click \<button-rotate\>: Execute \<action-img-rotate\> passing the angle defined in field \<input-rotate-angle\>.



- **FIX501.4.3.6** Click \<button-rotate90\>: Execute \<action-img-rotate\> passing +90 degrees.



- **FIX501.4.3.7** Click \<button-rotate270\>: Execute \<action-img-rotate\> passing -90 degrees.



- **FIX501.4.3.8** Click \<button-reset\>: Execute \<action-img-reset\>



- **FIX501.4.3.15** Click \<button-destruct-save\>: Execute \<action-destruct-save\>



- **FIX501.4.3.16** Click \<button-non-destruct-save\>: Execute \<action-non-destruct-save\>



- **FIX501.4.3.20** Right-click in the edited image: Opens contextual menu



- **FIX501.4.3.20.1** Menu option: Save: Execute \<action-destruct-save\>.



- **FIX501.4.3.20.2** Menu option: Shallow Save: Execute \<action-non-destruct-save\>.



- **FIX501.4.3.20.3** Menu option: Crop: Execute \<action-img-crop\>.



- **FIX501.4.3.21** Click ESC quits the Crop mode if active.



- **FIX501.4.4** Rules



- **FIX501.4.4.1** Reset



- **FIX501.4.4.1.0** Id \<action-img-reset\>



- **FIX501.4.4.1.1** Action: resets the cropping and rotation metadata of the image and refresh the image display.



- **FIX501.4.4.2** Crop



- **FIX501.4.4.2.0** Id \<action-img-crop\>



- **FIX501.4.4.2.1** Parameters: (x, y, width, height)



- **FIX501.4.4.2.1** Action: Crop the image by updating the metadata and refresh the image display.



- **FIX501.4.4.3** Rotate



- **FIX501.4.4.3.0** Id \<action-img-rotate\>



- **FIX501.4.4.3.1** Parameter: Angle



- **FIX501.4.4.3.2** Action: Rotate the image by updating the metadata and refresh the image display.



- **FIX501.4.4.10** Non-destructive Save: Only update the metadata of the image



- **FIX501.4.4.10.0** id \<action-non-destruct-save\>



- **FIX501.4.4.10.1** IF \<checkbox move-to-next\> is ON, after save, select the next node in the File Explorer.



- **FIX501.4.4.11** Destructive Save: effectively crop and rotate the image and store the result.



- **FIX501.4.4.11.0** id \<action-destruct-save\>



- **FIX501.4.4.11.1(old)** IF a meta data file was created for this image file, then it is removed.



- **FIX501.4.4.11.1** IF a meta data file was created for this image file, then it is removed and the display of the file name is refreshed.



- **FIX501.4.4.11.2** IF \<checkbox move-to-next\> is ON, after save, select the next node in the File Explorer.



- **FIX501.4.4.11.3** Do not show confirmation popup after save.



- **FIX501.4.5(old)** UI Insertion in the app: Refer to **FIX501.1** UI page.



- **FIX501.4.5** UI Insertion in the app: Refer to \<view-file-explorer\>



- **FIX501.20** Temporarily insertion in TELL project



- **FIX501.20.1** Button 'Photo' after "View' top menu.



- **FIX501.20.1.1** Action: Opens the Photo module in full screen



### Folder panel

- **FIX501.30** Folder panel



- **FIX501.30.0** Id \<panel-properties-and-imgs\>



- **FIX501.30.1** Purpose: Shows the properties of the folder and the associated images.



- **FIX501.30.2** UI Layout\
  ┌───────────┬────────────────────┐\
  │ │ Image List Header │\
  │ │────────────────────│\
  │ Property │ Image 1 │\
  │ panel │ │\
  │ │\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\--│\
  │ │ Image 2 │\
  └───────────┴────────────────────┘



- **FIX501.30.2.1** Property panel:



- **FIX501.30.2.1.1** Table listing Property label and property value



- **FIX501.30.2.1.2** Property values are editable texts.



- **FIX501.30.2.1.3** When a Main Image was selected, display the Main Image Icon below the list of Properties,



- **FIX501.30.2.1.3.1** Use the height defined by \<input-main-img-icon-height\>



- **FIX501.30.2.1.3.2** Left align in the page



- **FIX501.30.2.2** List of folder images: All images of the folder are displayed stacked in a vertical panel with a vertical scrollbar.



- **FIX501.30.2.2** Image List Header



- **FIX501.30.2.2.1** Group: Magnifying lens



- **FIX501.30.2.3** Image list



- **FIX501.30.2.3.1** The first image of the list must automatically be vertically adjusted if its height is bigger than the image panel height.



- **FIX501.30.2.2.2** Button: Main



- **FIX501.30.2.2.3** Group: Image size



- **FIX501.30.3** UI User Actions



- **FIX501.30.3.1** Magnifying lens



- **FIX501.30.3.1.1** Purpose: Zoom a portion of an image by hovering a



- **FIX501.30.3.1.2** Toolbox at the top of the images panel:



- **FIX501.30.3.1.2.1** Zoom group (radio toggle buttons):



- **FIX501.30.3.1.2.1.1** \'x1\' button --- lens off by default (hover has no effect).



- **FIX501.30.3.1.2.1.2** \'x2\' button --- 2× magnification; lens follows the cursor while hovering an image.



- **FIX501.30.3.1.2.1.3** \'x3\' button --- 3× magnification; lens follows the cursor while hovering an image.



- **FIX501.30.3.1.2.1.4** Default: \'x1\'.



- **FIX501.30.3.1.2.2** Size group (radio toggle buttons):



- **FIX501.30.3.1.2.2.1** \'Wide\' button --- lens diameter 400 px.



- **FIX501.30.3.1.2.2.2** \'Narrow\' button --- lens diameter 200 px.



- **FIX501.30.3.1.2.2.3** Default: \'Wide\'.



- **FIX501.30.3.1.2.2.4** Disabled (greyed out) when \'x1\' is selected.



- **FIX501.30.3.1.3** Behaviour:



- **FIX501.30.3.1.3.1** When zoom is x2 or x3, the lens is automatically shown while hovering any image in the panel.



- **FIX501.30.3.1.3.2** The lens is a circular area of the selected diameter that follows the cursor.



- **FIX501.30.3.1.3.3** The lens displays the region of the image directly underneath the cursor, magnified by the selected zoom factor.



- **FIX501.30.3.1.3.4** The lens disappears when the cursor leaves the image.



- **FIX501.30.3.2** Image size slider



- **FIX501.30.3.3** Button: 'Main'



- **FIX501.30.3.3.0** Id \<button-main-image\>



- **FIX501.30.3.3.1** Type: Toggle button



- **FIX501.30.3.3.2** Type: green background when ON



- **FIX501.30.3.3.3** Action:



- **FIX501.30.3.3.3.1** Sets the flag 'Main on the image currently displayed at the top of the image panel.



- **FIX501.30.3.3.3.2(old)** Create a Main Image Icon that can be inserted as 'Main Image Icon' in the Showcase List panel \<panel-showcase-list\>.



- **FIX501.30.3.3.3.2** Create a Main Image Icon of pixel height \<input-main-img-icon-height\> that can be inserted as 'Main Image Icon' in the Showcase List panel \<panel-showcase-list\>.



- **FIX501.30.4** UI Insertion in the app: Refer to \<view-file-explorer\>



- **FIX501.30.5** Functional rules



### View splitter

- **FIX501.50** View splitter



- **FIX501.50.0** Id \<view-file-explorer-split\>



- **FIX501.50.1** Purpose: Enable drag-and-drop transfer between two File Explorer panels showing images.



- **FIX501.50.2** Layout



- **FIX501.50.2.1** Left side (Slave):



- **FIX501.50.2.1.1** Slave File Explorer



- **FIX501.50.2.1.**2 Slave Image viewer: Shows selected image of the Slave File Explorer



- **FIX501.50.2.2** Right side (Master): Normal File Explorer View\
  \<panel-file-explorer\> + (\<panel_img_editor\> OR \<panel-properties-and-imgs\>)



- **FIX501.50.2.3** Resizable vertical splitter between the two sides



- **FIX501.50.2.10** Slave File Explorer panel



- **FIX501.50.2.10.0** id \<panel-file-explorer-slave\>



- **FIX501.50.2.10.1** Independent root folder, persisted separately



- **FIX501.50.2.10.2** Own header (root path + Change Root)



- **FIX501.50.2.10.3** No toolbar (no Add folder, no Remove, no Refresh)



- **FIX501.50.2.10.4** No right-click context menu



- **FIX501.50.2.10.5** No rename (no double-click)



- **FIX501.50.2.10.6** No arrow-key navigation, no Ctrl-Space handling



- **FIX501.50.2.10.7** Multi-selection allowed (for drag source)



- **FIX501.50.2.11** Slave Image viewer panel



- **FIX501.50.2.11.0** id \<panel-img-viewer-slave\>



- **FIX501.50.2.11.1** No toolbox and no possible modification



## Showcase View

- **FIX502** Showcase View



- **FIX502.0** Id \<view-showcase\>



- **FIX502.1** Purpose: Show in a table format the information of the folders having a property file.



- **FIX502.2** UI page\
  ┌────────────────────────────────────────────────────┐\
  │ Showcase Header panel │\
  ├──────────────────────────┬─────────────────────────┤\
  │ Showcase List panel │ Showcase Image viewer │\
  │ │ │\
  │ │ │\
  │ │ │\
  └──────────────────────────┴─────────────────────────┘



- **FIX502.2.1** Showcase Header panel: Refer to \<panel-showcase-header**\>**



- **FIX502.2.2** Showcase List panel: Refer to \<panel-showcase-list**\>**



- **FIX502.2.3** Showcase Image viewer: Refer to \<panel-showcase-img-viewer**\>**



## Showcase Header panel

- **FIX503** Showcase Header panel



- **FIX503.0** Id \<panel-showcase-header**\>**



## Showcase List panel 

- **FIX510** Showcase List panel



- **FIX510.0** Id \<panel-showcase-list**\>**



- **FIX510.1** Purpose: Display the information of the qualified folders (folder with a property file), enabling sorting and edition.



- **FIX510.2** UI Layout



- **FIX510.2.1** Field Item List: Table format.



- **FIX510.2.1.1** Columns are defined in the setup page for the Showcase view \<list-showcase-columns-setup\>.



- **FIX510.2.1.2** Scrollable list with list header always visible



- **FIX510.2.1.3** List can be sorted



- **FIX510.2.1.3.1** By clicking a column header



- **FIX510.2.1.3.2** By ctrl-clicking a 2^nd^ sorting key



- **FIX510.2.1.3** List can be filtered



- **FIX510.2.1.3.1** By entering a column value



- **FIX510.2.1.4(on hold)** List values can be edited, except for fields Folder name and Main image icon.



- **FIX510.2.1.5** Row selection colour is light orange.



- **FIX510.3** UI User Actions



- **FIX510.3.1** Ctrl-Space for a unique selected item switches to the File Explorer View with the corresponding Folder selected in the File Folder panel \<panel-file-explorer\>.



- **FIX501.3.1.1** The File Explorer View must scroll to show immediately the selected item.



- **FIX510.3.2** Up and Down Arrows navigate through the list.



- **FIX510.3.3** Left and Right Arrows navigate through the list of images in the Showcase Image viewer.



- **FIX510.4** UI Insertion in the App: Refer to \<view-showcase\>



- **FIX510.5** Functional features



## Showcase Image viewer 

- **FIX520** Showcase Image viewer



- **FIX520.0** Id \<panel-showcase-img-viewer**\>**



- **FIX520.1** Purpose: Shows all the images of the folder



- **FIX520.2** UI Layout\
  ┌──────────────┐\
  │ │\
  │ Image │\
  │ │\
  │ │\
  │ │\
  └──────────────┘\
  \[\<\] \[\>\]



- **FIX520.2.1** Image



- **FIX520.2.2** Button: Previous image '\<'



- **FIX520.2.2.1** Greyed out when no previous image



- **FIX520.2.3** Button: Next image '\>'



- **FIX520.2.3.1** Greyed out when no next image



- **FIX520.3** UI User Actions



- **FIX520.4** UI Insertion in the App



- **FIX520.5** Functional features



- **FIX520.5.1** On item selection in the Showcase List panel, if the item has a Main Image Icon defined, then it is this image in full scale that is first displayed



# Local Agent

- **TECH1** Local Agent



- **TECH1.1** A Local Agent is used for interacting with OS files or processes.



- **TECH1.1.1** Implementation is ./agent/agent.js



## Agent status

- **TECH1.2** Get Agent Status



- **TECH1.2.1** Server entry point: GET /agent/status\
  Health check, also reports whether the target Vite is running.



## Playwright script execution

- **TECH1.3** Playwright script execution



- **TECH1.3.1** Launch Vite server\
  Server entry point to spawn Vite on port 5174: POST /runner/start-target.\
  kills any previous target, spawns fresh Vite on 5174, waits 2 seconds then confirms.



- **TECH1.3.2** Execute a test script\
  Server entry point to spawn Playwright with stream results: POST /runner/run-test {script-path}\
  Spawns Playwright, streams every output line back to TELL via SSE, sends \[DONE:0\] or \[DONE:1\] when finished



## Search for available projects

- **TECH1.4** Search for available projects



- **TECH1.4.1** Search root directory\
  Reads the environment variable TELL_PROJECT_ROOT to get a root folder or use the user's home folder if variable is not defined.



- **TECH1.4.2** Search for projects: From the Search root directory, search for sub-folders at any depth having a **project.tell** file defined.



- **TECH1.4.3** Return the list of project folders with their related path to the Search root directory with server entry point GET /agent/projects.



## Read/write in the file system

- **TECH1.5** Read/write in the file system



- **TECH1.5.1** GET /agent/project/read?path=\... --- read project.tell



- **TECH1.5.2** POST /agent/project/write { path, content } --- write project.tell



- **TECH1.5.3** GET /agent/file/list?path= --- list .md files in a folder



- **TECH1.5.4** POST /file/open { path } --- register file + read content



- **TECH1.5.5** POST /file/save { content } --- write to registered file



- **TECH1.5.6** GET /file/status --- registered file status

