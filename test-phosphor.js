
const PhosphorIcons = require('@phosphor-icons/core');
console.log('Exports:', Object.keys(PhosphorIcons));
if (PhosphorIcons.icons) {
    console.log('Found icons array. Length:', PhosphorIcons.icons.length);
    if (PhosphorIcons.icons.length > 0) {
        console.log('Sample icon:', JSON.stringify(PhosphorIcons.icons[0], null, 2));
    }
} else {
    console.log('No icons export found.');
}
