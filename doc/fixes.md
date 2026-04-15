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



### Setup

- **FIX500.2** Photo Setup panel



### Setup: General panel

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



- **FIX500.2.1.3.10.0(removed)** Id \<photo-setup-save\>



- **FIX500.2.1.3.10.1** Saves setup data to a text file.



- **FIX500.2.1.4** UI insertion in the app: layer popup.



### Setup: File Explorer view setup panel

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



### Setup: Showcase view setup panel

- **FIX500.2.3** Showcase view setup panel



- **FIX500.2.3.0** Id \<panel-showcase-view-setup\>



- **FIX500.2.3.1** Purpose



- **FIX500.2.3.2** UI Layout



- **FIX500.2.3.2.1** Section 'Showcase columns'



- **FIX500.2.3.2.1.0** Id \<list-showcase-columns-setup\>



- **FIX500.2.3.2.1.1** Purpose: Define the list of columns to display in the Showcase list \<panel-showcase-list**\>**



- **FIX500.2.3.2.1.2** UI Layout:



- **FIX500.2.3.2.1.2.1** List of items: Contains 'Folder name' by default



- **FIX500.2.3.2.1.2.1.1** For each item, optional field to define the display column width expressed with a free text, which length will be used.



- **FIX500.2.3.2.1.2.1.2** For each item, checkbox to indicate whether the text of the field value should wrap.



- **FIX500.2.3.2.1.2.2** Item picker: Aggregates\
  - 'Folder name',\
  - The list of properties: Property labels from \<list-photo-properties\>\
  - 'Main image icon'



- **FIX500.2.3.2.1.2.3** Field 'Folder column name'\
  Optional input text field to replace 'Folder name' column name by another text.



- **FIX500.2.3.2.1.2.4** Field 'Roman year converter'\
  Checkbox that makes a property field 'Year' (case unsensitive) have it values postfix with ' ('yyyy')' when the value is a Roman year (e.g. MDCXIII)



- **FIX500.2.3.2.1.3** UI User Actions



- **FIX500.2.3.2.1.3.1** Add a new item in the list



- **FIX500.2.3.2.1.3.2** Remove an item from the list, but 'Folder name' cannot be removed.



- **FIX500.2.3.2.1.3.3** Move up/down items in the list



- **FIX500.2.3.4** UI Insertion in the App: Refer to \<panel-general-setup\>



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


